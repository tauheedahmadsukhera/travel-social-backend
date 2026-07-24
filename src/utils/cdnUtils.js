/**
 * Industrial CDN Media URL Helper
 * Transparently converts S3 URLs to CloudFront CDN URLs if CLOUDFRONT_DOMAIN is set.
 */
function toCdnUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const cfDomain = process.env.CLOUDFRONT_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN;
  if (!cfDomain) return url;

  if (url.includes('.amazonaws.com/')) {
    const parts = url.split('.amazonaws.com/');
    return `https://${cfDomain}/${parts[1]}`;
  }
  return url;
}

module.exports = { toCdnUrl };
