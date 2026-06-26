namespace HostingPlatform.Api.Exceptions;

public class ValidationException : Exception
{
    public IReadOnlyList<string> Errors { get; }

    public ValidationException(IEnumerable<string> errors) : base("Validation failed")
    {
        Errors = errors.ToList();
    }

    public ValidationException(string error) : this(new[] { error }) { }
}
