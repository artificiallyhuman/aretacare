# AWS IAM Policy for AretaCare

## Required IAM Policy

Replace `YOUR-BUCKET-NAME` with your actual S3 bucket name:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AretaCareS3BucketAccess",
            "Effect": "Allow",
            "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
        },
        {
            "Sid": "AretaCareS3ObjectAccess",
            "Effect": "Allow",
            "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:PutObjectAcl"],
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
        }
    ]
}
```

## Setup Steps

1. **Create IAM User**: IAM Console → Users → Add users → `aretacare-app` → Programmatic access
2. **Create Policy**: Permissions → Attach policies → Create policy → JSON tab → Paste policy above
3. **Name Policy**: `AretaCareS3Access`
4. **Attach & Save**: Attach to user → **Save Access Key ID and Secret Access Key immediately**

## Environment Variables

Add to `backend/.env`:
```env
AWS_ACCESS_KEY_ID=AKIA...your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

## Permission Reference

| Permission | Purpose |
|------------|---------|
| s3:ListBucket | List files in bucket |
| s3:GetBucketLocation | Get bucket region |
| s3:PutObject | Upload files |
| s3:GetObject | Download files, presigned URLs |
| s3:DeleteObject | Delete files |
| s3:PutObjectAcl | Set file permissions |

**Not included (intentionally):** s3:DeleteBucket, s3:CreateBucket, s3:PutBucketPolicy

## Multiple Environments

For dev/staging/prod with separate buckets, list all in the Resource arrays:
```json
"Resource": [
    "arn:aws:s3:::aretacare-dev",
    "arn:aws:s3:::aretacare-staging",
    "arn:aws:s3:::aretacare-prod"
]
```

## Quick Test (AWS CLI)

```bash
aws configure  # Enter credentials
aws s3 ls s3://YOUR-BUCKET-NAME
aws s3 cp test.txt s3://YOUR-BUCKET-NAME/test.txt
aws s3 rm s3://YOUR-BUCKET-NAME/test.txt
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| Access Denied | Check bucket name in policy matches actual bucket |
| Bucket Not Found | Verify bucket exists and region is correct |
| Invalid Access Key | Verify credentials copied correctly (no spaces) |

## Security Best Practices

- Specify exact bucket names, never use `*`
- Use separate credentials per environment
- Rotate credentials regularly
- Use IAM Roles when deploying to AWS (EC2/ECS/Lambda)
