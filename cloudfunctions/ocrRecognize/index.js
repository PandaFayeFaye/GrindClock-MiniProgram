// UNVERIFIED TEMPLATE -- not tested end-to-end, see cloudfunctions/README.md.
// Recognizes text from a photo (e.g. a schedule board or punch-clock screenshot)
// using Tencent Cloud's General OCR API, and returns the joined text so the
// mini program's regex parser (lib/parseSpeechToDraft.ts) can turn it into a
// draft time entry.
const cloud = require("wx-server-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const OcrClient = tencentcloud.ocr.v20181119.Client;

exports.main = async (event) => {
  const { fileID } = event;
  if (!fileID) {
    return { text: "", error: "missing fileID" };
  }

  try {
    const fileRes = await cloud.downloadFile({ fileID });
    const base64Image = fileRes.fileContent.toString("base64");

    const client = new OcrClient({
      credential: {
        secretId: process.env.TENCENTCLOUD_SECRETID,
        secretKey: process.env.TENCENTCLOUD_SECRETKEY,
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: { endpoint: "ocr.tencentcloudapi.com" },
      },
    });

    const result = await client.GeneralBasicOCR({ ImageBase64: base64Image });
    const text = (result.TextDetections || []).map((d) => d.DetectedText).join("\n");
    return { text };
  } catch (err) {
    console.error("ocrRecognize failed", err);
    return { text: "", error: String(err) };
  }
};
