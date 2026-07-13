// CloudFront Function (viewer-request) for the static-site distribution.
//
// Sites are served under /{userId}/{projectId}/, but `default_root_object` only
// applies to the distribution root, and the S3 REST origin does not resolve
// index documents for "directory" requests. This function makes directory-style
// requests load the right index.html while keeping RELATIVE asset references
// (e.g. "./assets/index-*.js") resolvable in the browser:
//
//   /userId/projectId/       -> rewrite to /userId/projectId/index.html
//   /userId/projectId        -> 302 redirect to /userId/projectId/
//   /userId/projectId/app.js -> unchanged (already a file)
//
// Why the extension-less case REDIRECTS instead of rewriting: the published
// URL has no trailing slash (docs/10 Step 12). Rewriting it straight to
// index.html serves the page, but the browser's document URL stays
// ".../{projectId}" (no slash), so a relative reference "./assets/x.js"
// resolves against ".../{userId}/" — dropping the {projectId} segment — and
// 404s (S3 returns 403 AccessDenied for the missing key). Redirecting to the
// trailing-slash URL first makes the document base ".../{projectId}/", so
// "./assets/x.js" correctly resolves to ".../{projectId}/assets/x.js". The
// redirected request then hits the trailing-slash branch above.
//
// ES5-only syntax: the CloudFront Functions runtime does not support all ES6.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Directory request ("/.../"): serve the directory's index document.
    if (uri.charAt(uri.length - 1) === '/') {
        request.uri = uri + 'index.html';
        return request;
    }

    // Extension-less request ("/user/project"): redirect to the trailing-slash
    // form so relative asset URLs resolve against the correct directory.
    var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
    if (lastSegment.indexOf('.') === -1) {
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: {
                'location': { value: uri + '/' }
            }
        };
    }

    return request;
}
