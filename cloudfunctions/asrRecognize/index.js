// UNVERIFIED TEMPLATE -- not tested end-to-end, see cloudfunctions/README.md.
// Transcribes a short voice memo (e.g. "今天在星巴克上了8个小时") using
// Tencent Cloud's one-sentence ASR API, and returns the text for
// lib/parseSpeechToDraft.ts to parse into a draft time entry.
const cloud = require("wx-server-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs-asr");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const AsrClient = tencentcloud.asr.v20190614.Client;

exports.main = async (event) => {
  const { fileID } = event;
  if (!fileID) {
    return { text: "", error: "missing fileID" };
  }

  try {
    const fileRes = await cloud.downloadFile({ fileID });
    const base64Audio = fileRes.fileContent.toString("base64");

    const client = new AsrClient({
      credential: {
        secretId: process.env.TENCENTCLOUD_SECRETID,
        secretKey: process.env.TENCENTCLOUD_SECRETKEY,
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: { endpoint: "asr.tencentcloudapi.com" },
      },
    });

    const result = await client.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: "16k_zh",
      SourceType: 1,
      VoiceFormat: "mp3",
      UsrAudioKey: String(Date.now()),
      Data: base64Audio,
    });

    return { text: result.Result || "" };
  } catch (err) {
    console.error("asrRecognize failed", err);
    return { text: "", error: String(err) };
  }
};
