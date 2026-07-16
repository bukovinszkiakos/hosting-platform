using HostingPlatform.Api.Services;
using Xunit;

namespace HostingPlatform.Api.Tests;

public class DeploymentStatusTests
{
    [Theory]
    [InlineData("Pending")]
    [InlineData("Building")]
    [InlineData("Deploying")]
    [InlineData("Online")]
    [InlineData("Failed")]
    public void IsValid_true_for_known_statuses(string status)
        => Assert.True(DeploymentStatus.IsValid(status));

    [Theory]
    [InlineData("Draft")]
    [InlineData("")]
    [InlineData("online")] // case-sensitive
    public void IsValid_false_for_unknown_statuses(string status)
        => Assert.False(DeploymentStatus.IsValid(status));

    [Theory]
    [InlineData("Online")]
    [InlineData("Failed")]
    public void IsTerminal_true_for_terminal_states(string status)
        => Assert.True(DeploymentStatus.IsTerminal(status));

    [Theory]
    [InlineData("Pending")]
    [InlineData("Building")]
    [InlineData("Deploying")]
    public void IsTerminal_false_for_non_terminal_states(string status)
        => Assert.False(DeploymentStatus.IsTerminal(status));

    [Theory]
    [InlineData("Pending", "Building")]
    [InlineData("Pending", "Failed")]
    [InlineData("Building", "Deploying")]
    [InlineData("Building", "Failed")]
    [InlineData("Deploying", "Online")]
    [InlineData("Deploying", "Failed")]
    public void CanTransition_allows_valid_transitions(string from, string to)
        => Assert.True(DeploymentStatus.CanTransition(from, to));

    [Theory]
    [InlineData("Pending", "Deploying")] // cannot skip Building
    [InlineData("Pending", "Online")]
    [InlineData("Building", "Online")] // cannot skip Deploying
    [InlineData("Deploying", "Building")] // no going back
    [InlineData("Online", "Failed")] // terminal
    [InlineData("Failed", "Building")] // terminal
    public void CanTransition_rejects_invalid_transitions(string from, string to)
        => Assert.False(DeploymentStatus.CanTransition(from, to));
}
