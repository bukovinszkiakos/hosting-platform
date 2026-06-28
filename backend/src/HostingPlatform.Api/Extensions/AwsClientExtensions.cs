using Amazon;
using Amazon.S3;
using HostingPlatform.Api.Configuration;
using Microsoft.Extensions.Options;

namespace HostingPlatform.Api.Extensions;

public static class AwsClientExtensions
{
    // Registers the S3 client. Credentials come from the default AWS credential
    // provider chain (an IAM role in EKS; environment/profile locally), so none are
    // configured here. The region comes from AwsSettings when set. Resolved lazily
    // as a singleton, so the backend still starts locally when AWS is not configured.
    public static IServiceCollection AddS3Client(this IServiceCollection services)
    {
        services.AddSingleton<IAmazonS3>(sp =>
        {
            var aws = sp.GetRequiredService<IOptions<AwsSettings>>().Value;
            var config = new AmazonS3Config();
            if (!string.IsNullOrWhiteSpace(aws.Region))
            {
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(aws.Region);
            }

            return new AmazonS3Client(config);
        });

        return services;
    }
}
