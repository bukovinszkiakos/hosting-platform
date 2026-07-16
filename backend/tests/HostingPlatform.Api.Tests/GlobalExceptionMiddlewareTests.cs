using System.Text.Json;
using HostingPlatform.Api.Exceptions;
using HostingPlatform.Api.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace HostingPlatform.Api.Tests;

public class GlobalExceptionMiddlewareTests
{
    // Runs the middleware with a pipeline that throws the given exception and
    // returns the resulting status code and (JSON) response body.
    private static async Task<(int Status, string Body)> InvokeWith(Exception thrown)
    {
        var middleware = new GlobalExceptionMiddleware(
            _ => throw thrown,
            NullLogger<GlobalExceptionMiddleware>.Instance);

        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(context.Response.Body);
        return (context.Response.StatusCode, await reader.ReadToEndAsync());
    }

    [Fact]
    public async Task ValidationException_maps_to_400_with_errors()
    {
        var (status, body) = await InvokeWith(new ValidationException(new[] { "Name is required" }));

        Assert.Equal(StatusCodes.Status400BadRequest, status);
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("Validation failed", doc.RootElement.GetProperty("message").GetString());
        Assert.Equal("Name is required", doc.RootElement.GetProperty("errors")[0].GetString());
    }

    [Theory]
    [InlineData(typeof(UnauthorizedException), StatusCodes.Status401Unauthorized)]
    [InlineData(typeof(ForbiddenException), StatusCodes.Status403Forbidden)]
    [InlineData(typeof(NotFoundException), StatusCodes.Status404NotFound)]
    public async Task Known_exceptions_map_to_their_status_and_message(Type exceptionType, int expectedStatus)
    {
        var thrown = (Exception)Activator.CreateInstance(exceptionType, "boom")!;

        var (status, body) = await InvokeWith(thrown);

        Assert.Equal(expectedStatus, status);
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("boom", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Unhandled_exception_maps_to_500_without_leaking_details()
    {
        var (status, body) = await InvokeWith(new InvalidOperationException("secret detail"));

        Assert.Equal(StatusCodes.Status500InternalServerError, status);
        using var doc = JsonDocument.Parse(body);
        Assert.Equal("Internal Server Error", doc.RootElement.GetProperty("message").GetString());
        Assert.DoesNotContain("secret detail", body); // internal detail must not reach the client
    }
}
