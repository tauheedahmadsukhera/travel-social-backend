# 🚀 AWS S3 Storage Setup & Migration Guide

This step-by-step guide will walk you through setting up **Amazon Web Services (AWS) S3** for your mobile app, configuring permissions, and switching the backend from Cloudinary to S3.

---

## 📂 Step 1: Create an S3 Bucket on AWS Console

1. Log in to the [AWS Management Console](https://aws.amazon.com/console/).
2. In the top search bar, search for **S3** and select it.
3. Click the orange **Create bucket** button.
4. Configure the following:
   - **Bucket name**: Choose a unique name (e.g., `trave-social-media-bucket`).
   - **AWS Region**: Choose a region close to your users (e.g., `us-east-1` or `eu-west-1`).
   - **Object Ownership**: Leave **ACLs disabled (recommended)** selected.
   - **Block Public Access settings for this bucket**:
     - ⚠️ **Uncheck** the box that says "Block *all* public access".
     - Check the box that says **"I acknowledge that the current settings might result in this bucket and the objects within becoming public."** (This is required so your users can view uploaded post photos/videos).
5. Scroll to the bottom and click **Create bucket**.

---

## 🔒 Step 2: Configure CORS (Cross-Origin Resource Sharing)
*CORS is required so that mobile devices and browsers can download/upload media directly to your S3 bucket without being blocked by security policies.*

1. In the S3 console, click on your newly created bucket name.
2. Go to the **Permissions** tab.
3. Scroll down to the **Cross-origin resource sharing (CORS)** section and click **Edit**.
4. Paste the following JSON configuration into the editor:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "PUT",
            "POST",
            "DELETE",
            "HEAD"
        ],
        "AllowedOrigins": [
            "*"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```
5. Click **Save changes**.

---

## 🌐 Step 3: Configure Bucket Policy (Allows media to be viewed in the app)
*This policy makes all objects inside the bucket publicly readable, enabling image/video URLs to open on iOS/Android devices.*

1. Under the same **Permissions** tab, scroll to the **Bucket policy** section and click **Edit**.
2. Paste the following JSON policy. **Make sure to replace `YOUR-BUCKET-NAME`** with your actual bucket name:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
        }
    ]
}
```
3. Click **Save changes**.

---

## 🔑 Step 4: Create IAM Access Keys for the Backend

1. In the top search bar of the AWS Console, search for **IAM** and select it.
2. In the left sidebar, click **Users**, then click **Create user**.
3. Configure the user:
   - **User name**: e.g., `trave-social-backend-uploader`.
   - Click **Next**.
4. Under **Permissions options**, select **Attach policies directly**.
5. Search the policy list for **`AmazonS3FullAccess`**, check the box next to it, and click **Next**.
6. Click **Create user**.
7. Select the user you just created from the users list.
8. Go to the **Security credentials** tab.
9. Scroll down to the **Access keys** section and click **Create access key**.
10. Select **Application running outside AWS** and click **Next**.
11. Click **Create access key**.
12. ⚠️ **IMPORTANT**: Copy the **Access key ID** and **Secret access key** immediately. Store them securely (or download the `.csv` file), as you won't be able to retrieve the secret key again!

---

## ⚙️ Step 5: Configure Backend Environment Variables

Add the following environment variables to your production backend server (e.g., in your **Render Dashboard** or local `.env` file):

| Variable Name | Value Description | Example |
| :--- | :--- | :--- |
| `STORAGE_PROVIDER` | Set to `s3` to enable AWS S3 | `s3` |
| `AWS_ACCESS_KEY_ID` | Your IAM Access Key ID | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | Your IAM Secret Access Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | The region of your S3 Bucket | `us-east-1` |
| `AWS_S3_BUCKET_NAME` | The name of your S3 Bucket | `trave-social-media-bucket` |

*To switch back to Cloudinary at any time, just set `STORAGE_PROVIDER` to `cloudinary` (or remove it).*
