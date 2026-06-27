using System.Security.Claims;
using HostingPlatform.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HostingPlatform.Api.Controllers;

[ApiController]
[Authorize]
public class DeploymentsController : ControllerBase
{
    private readonly IDeploymentService _deploymentService;

    public DeploymentsController(IDeploymentService deploymentService)
    {
        _deploymentService = deploymentService;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpPost("api/projects/{projectId:guid}/deploy")]
    public async Task<IActionResult> CreateDeployment(Guid projectId)
    {
        var deployment = await _deploymentService.CreateDeploymentAsync(CurrentUserId, projectId);
        return CreatedAtAction(
            nameof(GetDeployment),
            new { id = deployment.Id },
            new { deploymentId = deployment.Id, status = deployment.Status });
    }

    [HttpGet("api/projects/{projectId:guid}/deployments")]
    public async Task<IActionResult> GetProjectDeployments(Guid projectId)
    {
        var deployments = await _deploymentService.GetProjectDeploymentsAsync(CurrentUserId, projectId);
        return Ok(deployments);
    }

    [HttpGet("api/deployments/{id:guid}")]
    public async Task<IActionResult> GetDeployment(Guid id)
    {
        var deployment = await _deploymentService.GetDeploymentAsync(CurrentUserId, id);
        return Ok(deployment);
    }

    [HttpGet("api/deployments/{id:guid}/logs")]
    public async Task<IActionResult> GetDeploymentLogs(Guid id)
    {
        var logs = await _deploymentService.GetDeploymentLogsAsync(CurrentUserId, id);
        return Ok(logs);
    }
}
