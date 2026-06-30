// CloudFront Function (viewer-request) for the static-site distribution.
//
// Sites are served under /{userId}/{projectId}/, but `default_root_object` only
// applies to the distribution root, and the S3 REST origin does not resolve
// index documents for "directory" requests. This function rewrites such requests
// so the right index.html is fetched:
//
//   /userId/projectId        -> /userId/projectId/index.html
//   /userId/projectId/       -> /userId/projectId/index.html
//   /userId/projectId/app.js -> unchanged (already a file)
//
// ES5-only syntax: the CloudFront Functions runtime does not support all ES6.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Directory request ("/.../"): append the index document.
    if (uri.charAt(uri.length - 1) === '/') {
        request.uri = uri + 'index.html';
        return request;
    }

    // Extension-less request ("/user/project"): treat it as a directory.
    var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
    if (lastSegment.indexOf('.') === -1) {
        request.uri = uri + '/index.html';
    }

    return request;
}
