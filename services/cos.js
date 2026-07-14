const COS = require('cos-nodejs-sdk-v5');
const path = require('path');

// 初始化 COS 客户端
let cosClient = null;

function getCosClient() {
  if (cosClient) return cosClient;

  cosClient = new COS({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY,
  });

  return cosClient;
}

/**
 * 上传文件到腾讯云 COS
 * @param {string} userId - 用户ID
 * @param {Buffer} fileBuffer - 文件内容
 * @param {string} originalName - 原始文件名
 * @returns {Promise<{fileUrl: string, cosKey: string, fileSize: number}>}
 */
function uploadToCos(userId, fileBuffer, originalName) {
  return new Promise((resolve, reject) => {
    const client = getCosClient();
    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;

    // 构建存储路径：pdf-uploads/YYYY-MM-DD/userId-timestamp-originalName
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timestamp = now.getTime();
    const ext = path.extname(originalName);
    const safeName = `${dateStr}/${userId}-${timestamp}${ext}`;
    const cosKey = `pdf-uploads/${safeName}`;

    client.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: cosKey,
        Body: fileBuffer,
        ContentType: 'application/pdf',
      },
      (err, data) => {
        if (err) {
          console.error('COS 上传失败:', err);
          reject(err);
          return;
        }

        const fileUrl = `https://${bucket}.cos.${region}.myqcloud.com/${cosKey}`;

        resolve({
          fileUrl,
          cosKey,
        });
      }
    );
  });
}

/**
 * 从 COS 下载文件
 */
function downloadFromCos(cosKey) {
  return new Promise((resolve, reject) => {
    const client = getCosClient();

    client.getObject(
      {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.COS_REGION,
        Key: cosKey,
      },
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data.Body);
      }
    );
  });
}

/**
 * 从 COS 删除文件
 */
function deleteFromCos(cosKey) {
  return new Promise((resolve, reject) => {
    const client = getCosClient();

    client.deleteObject(
      {
        Bucket: process.env.COS_BUCKET,
        Region: process.env.COS_REGION,
        Key: cosKey,
      },
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      }
    );
  });
}

module.exports = { uploadToCos, downloadFromCos, deleteFromCos };
