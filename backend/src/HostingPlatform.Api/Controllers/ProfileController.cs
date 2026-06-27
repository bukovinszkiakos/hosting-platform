using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HostingPlatform.Api.Controllers;

[ApiController]
[Route("api/profile")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly IProfileService _profileService;

    public ProfileController(IProfileService profileService)
    {
        _profileService = profileService;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var profile = await _profileService.GetProfileAsync(User);
        return Ok(profile);
    }

    [HttpPut]
    public async Task<IActionResult> Update(UpdateProfileRequest request)
    {
        await _profileService.UpdateProfileAsync(User, request);
        return Ok(new { message = "Profile updated" });
    }
}
