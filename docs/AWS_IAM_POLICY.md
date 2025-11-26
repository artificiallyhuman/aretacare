# AWS IAM Policy for AretaCare

This document contains the IAM policy configuration needed for AretaCare's S3 access.

## Recommended IAM Policy (Least Privilege)

Use this policy for production. It grants only the necessary permissions for AretaCare to function.

### Policy JSON

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AretaCareS3BucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
        },
        {
            "Sid": "AretaCareS3ObjectAccess",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:PutObjectAcl"
            ],
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
        }
    ]
}
```

**Replace `YOUR-BUCKET-NAME` with your actual S3 bucket name.**

For example, if your bucket is `aretacare-documents-prod`, the policy would be:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AretaCareS3BucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": "arn:aws:s3:::aretacare-documents-prod"
        },
        {
            "Sid": "AretaCareS3ObjectAccess",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:PutObjectAcl"
            ],
            "Resource": "arn:aws:s3:::aretacare-documents-prod/*"
        }
    ]
}
```

## What This Policy Allows

### Bucket-Level Permissions
- **s3:ListBucket**: List files in the bucket
- **s3:GetBucketLocation**: Get the bucket's region

### Object-Level Permissions
- **s3:PutObject**: Upload files
- **s3:GetObject**: Download files (and generate presigned URLs)
- **s3:DeleteObject**: Delete files
- **s3:PutObjectAcl**: Set object access control

## Step-by-Step IAM Setup

### Option 1: Create IAM User with Custom Policy (Recommended)

#### 1. Create the IAM User

1. Log in to AWS Console: https://console.aws.amazon.com/iam/
2. Click **Users** → **Add users**
3. Enter username: `aretacare-app`
4. Select **Access key - Programmatic access**
5. Click **Next: Permissions**

#### 2. Create Custom Policy

1. Click **Attach policies directly**
2. Click **Create policy**
3. Click the **JSON** tab
4. Paste the policy JSON above (with your bucket name)
5. Click **Next: Tags** (optional)
6. Click **Next: Review**
7. Enter policy name: `AretaCareS3Access`
8. Enter description: `S3 access for AretaCare application`
9. Click **Create policy**

#### 3. Attach Policy to User

1. Go back to the user creation page
2. Click the refresh button next to **Create policy**
3. Search for `AretaCareS3Access`
4. Check the box next to it
5. Click **Next: Tags** (optional)
6. Click **Next: Review**
7. Click **Create user**

#### 4. Save Credentials

⚠️ **IMPORTANT**: Save these credentials immediately - you won't see them again!

- **Access Key ID**: Copy to `backend/.env` as `AWS_ACCESS_KEY_ID`
- **Secret Access Key**: Copy to `backend/.env` as `AWS_SECRET_ACCESS_KEY`

### Option 2: Use Existing IAM User

If you already have an IAM user:

1. Go to **IAM** → **Users**
2. Click on your user
3. Click **Add permissions** → **Attach policies directly**
4. Follow steps 2-3 from Option 1 to create and attach the policy

## Alternative: Using AWS Managed Policy (Simpler but Less Secure)

If you want a quicker setup (not recommended for production):

### AmazonS3FullAccess Policy

This gives full access to ALL S3 buckets:

1. When creating/editing IAM user
2. Select **Attach policies directly**
3. Search for `AmazonS3FullAccess`
4. Check the box
5. Continue with user creation

⚠️ **Warning**: This gives access to ALL your S3 buckets, not just the AretaCare bucket. Only use for testing.

## Testing IAM Permissions

### Using AWS CLI

Install AWS CLI and test:

```bash
# Configure credentials
aws configure

# Test bucket access
aws s3 ls s3://YOUR-BUCKET-NAME

# Test upload
echo "test" > test.txt
aws s3 cp test.txt s3://YOUR-BUCKET-NAME/test.txt

# Test download
aws s3 cp s3://YOUR-BUCKET-NAME/test.txt downloaded.txt

# Test delete
aws s3 rm s3://YOUR-BUCKET-NAME/test.txt
```

If all commands work, your permissions are correctly configured.

## Security Best Practices

### 1. Bucket Name in Policy
Always specify the exact bucket name in the policy - never use `*`

❌ Bad:
```json
"Resource": "arn:aws:s3:::*"
```

✅ Good:
```json
"Resource": "arn:aws:s3:::aretacare-documents-prod"
```

### 2. Use Different Credentials for Different Environments

- **Development**: One set of credentials
- **Staging**: Different set of credentials
- **Production**: Different set of credentials

### 3. Rotate Credentials Regularly

1. Create new access key
2. Update application with new credentials
3. Test thoroughly
4. Delete old access key

### 4. Use IAM Roles (When Deploying to AWS)

If deploying to AWS services (EC2, ECS, Lambda):
- Use IAM Roles instead of access keys
- Attach the same policy to the role
- No credentials needed in `.env`

### 5. Enable MFA for IAM User (Console Access)

If the IAM user has console access:
1. Enable MFA for additional security
2. Require MFA for sensitive operations

## Troubleshooting

### "Access Denied" Error

**Check:**
1. Bucket name in policy matches actual bucket name
2. Credentials are correct in `.env`
3. Policy is attached to the user
4. Bucket exists and is in the correct region

### "Bucket Not Found" Error

**Check:**
1. Bucket name is spelled correctly
2. Bucket exists in your AWS account
3. Region is correct in `backend/.env`

### "Invalid Access Key" Error

**Check:**
1. Access key is copied correctly (no extra spaces)
2. Secret key is copied correctly
3. Credentials haven't been deleted or rotated

## Environment Variables

Add these to `backend/.env`:

```env
AWS_ACCESS_KEY_ID=AKIA...your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

## Policy Explanation

### Why These Permissions?

| Permission | Why Needed | Used For |
|------------|------------|----------|
| s3:ListBucket | List files in bucket | Debugging, management |
| s3:GetBucketLocation | Get bucket region | SDK initialization |
| s3:PutObject | Upload files | Document uploads |
| s3:GetObject | Download files | Presigned URLs, retrieval |
| s3:DeleteObject | Delete files | Document deletion |
| s3:PutObjectAcl | Set permissions | File access control |

### Permissions NOT Included (Intentionally)

- s3:DeleteBucket - Application should never delete the bucket
- s3:CreateBucket - Bucket should be created manually
- s3:PutBucketPolicy - Bucket policy managed separately
- Administrative actions - Keep separate from application access

## Multiple Buckets (Dev/Staging/Prod)

If you use different buckets for different environments:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AretaCareMultiBucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": [
                "arn:aws:s3:::aretacare-dev",
                "arn:aws:s3:::aretacare-staging",
                "arn:aws:s3:::aretacare-prod"
            ]
        },
        {
            "Sid": "AretaCareMultiBucketObjectAccess",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:PutObjectAcl"
            ],
            "Resource": [
                "arn:aws:s3:::aretacare-dev/*",
                "arn:aws:s3:::aretacare-staging/*",
                "arn:aws:s3:::aretacare-prod/*"
            ]
        }
    ]
}
```

## Getting Help

If you encounter issues:

1. Verify bucket exists: AWS Console → S3
2. Verify user exists: AWS Console → IAM → Users
3. Verify policy is attached: User → Permissions
4. Test with AWS CLI
5. Check CloudTrail logs for detailed error messages

## Resources

- [AWS IAM Documentation](https://docs.aws.amazon.com/iam/)
- [S3 Permissions Reference](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-actions.html)
- [IAM Policy Generator](https://awspolicygen.s3.amazonaws.com/policygen.html)
