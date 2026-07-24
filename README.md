# estranged-lfs-bunnynet

Git LFS batch API server running as a [bunny.net Edge Script](https://docs.bunny.net/scripting). Ported from [Estranged.Lfs](https://github.com/EstrangedGame/Estranged.Lfs).

S3 presigned URLs via [aws4fetch](https://github.com/mhart/aws4fetch) (no AWS SDK), dictionary and GitHub auth, CloudFront host swap. ~$0.22/month compute at indie game traffic levels.

## Deploy

```bash
npm install && npm run build
bunny scripts deploy dist/index.js
```

Set environment variables via the dashboard or CLI. Required: `LFS_S3_BUCKET`, `LFS_S3_ACCESS_KEY_ID`, `LFS_S3_SECRET_ACCESS_KEY`, `LFS_AUTH_MODE`. See below for the full list.

Configure your Git repo to point at the edge script:

```ini
# .lfsconfig
[lfs]
    url = https://your-pull-zone.bunny.net/
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LFS_S3_BUCKET` | Yes | — | S3 bucket name |
| `LFS_S3_ACCESS_KEY_ID` | Yes | — | AWS access key ID |
| `LFS_S3_SECRET_ACCESS_KEY` | Yes | — | AWS secret access key |
| `LFS_AUTH_MODE` | Yes | — | `dictionary` or `github` |
| `LFS_S3_REGION` | No | `us-east-1` | AWS region |
| `LFS_S3_KEY_PREFIX` | No | `""` | Prefix prepended to S3 object keys |
| `LFS_S3_ENDPOINT` | No | AWS default | Custom S3 endpoint (for S3-compatible stores) |
| `LFS_S3_EXPIRY_SECONDS` | No | `3600` | Presigned URL expiry in seconds |
| `LFS_CLOUDFRONT_DOMAIN` | No | — | CloudFront domain for host swap |
| `LFS_USERNAME` | If dictionary | — | Single username |
| `LFS_PASSWORD` | If dictionary | — | Single password |
| `LFS_CREDENTIALS` | If dictionary | — | JSON `{"user":"pass"}` for multiple users |
| `GITHUB_ORGANISATION` | If github | — | GitHub organisation |
| `GITHUB_REPOSITORY` | If github | — | GitHub repository |
| `GITHUB_API_BASE` | No | `https://api.github.com/` | GitHub API base URL (for GHES) |

## Develop

```bash
npm install
npm run build    # bundle to dist/index.js
npm test         # run tests
npm run dev      # watch mode
```

## Not implemented

- Azure Blob storage (S3 only)
- BitBucket authentication (dictionary and GitHub supported)
- Git LFS Locks API (returns 404, matching the C# version)

## License

MIT