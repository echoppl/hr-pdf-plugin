/**
 * 简历解析服务
 * 流程：
 *   1. pdf-parse 尝试提取文本（文本型 PDF）
 *   2. 失败 → pdf-to-img 渲染为图片 → 视觉模型识别（扫描件/图片型 PDF）
 */

const { PDFParse } = require('pdf-parse');
const { pdf: pdfToImg } = require('pdf-to-img');

// ====== LLM Prompt ======
const SYSTEM_PROMPT = `你是一个专业的简历解析器。从以下简历内容中提取结构化信息，以 JSON 格式返回。

规则：
- 如果某个字段在原简历中未找到，设置为空字符串 ""
- 手机号：提取简历中的手机号，可能包含横线或空格（如 176-8884-6957 或 176 8884 6957），请照原样返回，不要漏掉
- 年龄默认使用数字字符串，如不明确则设置 ""
- 学历取值：博士/硕士/本科/大专/高中及以下/其他
- 性别取值：男/女
- 工作经验总年限：从工作经历推算总年限，字符串形式如 "3" 或 "3-5"
- 工作经历按时间倒序排列（最新的在前）

返回格式必须是纯 JSON，不要包含任何 markdown 标记或额外说明：
{
  "name": "姓名",
  "gender": "男/女",
  "age": "年龄",
  "education": "学历",
  "city": "所在城市",
  "years_total": "工作经验总年限",
  "target_position": "应聘职位",
  "phone": "手机号",
  "email": "邮箱",
  "work_experiences": [
    { "company": "公司名", "position": "职位", "period": "时间段如2019.06-2023.08" }
  ],
  "source_channel": "",
  "hr_name": "",
  "reviewer": ""
}`;

const TEXT_PROMPT = SYSTEM_PROMPT + '\n\n需要解析的简历文本如下：';

// ====== LLM 配置 ======
function getLLMConfig() {
  return {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    visionModel: process.env.LLM_VISION_MODEL || 'glm-4v-flash',
  };
}

// ====== 从 PDF Buffer 提取文本 ======
async function extractTextFromPdf(buffer) {
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = (result.text || '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\r/g, '')
      .trim();
    return text;
  } catch (err) {
    console.error('PDF文本提取失败:', err.message);
    return '';
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch (_) {}
    }
  }
}

// ====== PDF 渲染为图片（用于扫描件） ======
async function pdfToImages(buffer, maxPages = 3) {
  const images = [];
  try {
    const doc = await pdfToImg(buffer, { scale: 2 });
    let pageNum = 0;
    for await (const page of doc) {
      images.push(page);
      pageNum++;
      if (pageNum >= maxPages) break;
    }
  } catch (err) {
    console.error('PDF渲染为图片失败:', err.message);
    throw new Error(`PDF 渲染失败: ${err.message}`);
  }
  return images;
}

// ====== 解析 LLM 返回的 JSON ======
function parseLLMResponse(content) {
  if (!content) return null;

  let jsonStr = content.trim();
  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  return JSON.parse(jsonMatch[0]);
}

// ====== 纯文本解析（文本型 PDF） ======
async function parseWithTextLLM(text) {
  const { apiKey, baseUrl, model } = getLLMConfig();

  if (!apiKey || apiKey === 'sk-your-api-key') {
    throw new Error('请先配置 LLM_API_KEY（在 .env 文件中设置）');
  }

  const url = `${baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: TEXT_PROMPT + '\n\n' + text },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM API 错误 (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const parsed = parseLLMResponse(content);
  if (!parsed) throw new Error('LLM 返回内容无法解析为 JSON');
  return parsed;
}

// ====== 视觉解析（扫描件/图片型 PDF） ======
async function parseWithVisionLLM(images) {
  const { apiKey, baseUrl, visionModel } = getLLMConfig();

  if (!apiKey || apiKey === 'sk-your-api-key') {
    throw new Error('请先配置 LLM_API_KEY（在 .env 文件中设置）');
  }

  const url = `${baseUrl}/chat/completions`;

  // 构建多模态消息：文本 + 图片
  const contentParts = [
    { type: 'text', text: `${SYSTEM_PROMPT}\n\n以下是简历的图片，请逐页读取并提取结构化信息。` },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${img.toString('base64')}` },
    })),
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: visionModel,
      messages: [{ role: 'user', content: contentParts }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`视觉LLM API 错误 (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const parsed = parseLLMResponse(content);
  if (!parsed) throw new Error('视觉模型返回内容无法解析为 JSON');
  return parsed;
}

// ====== 主入口：完整解析流程 ======
async function parseResume(pdfBuffer) {
  const t0 = Date.now();

  // 1. 先尝试文本提取
  console.log('[简历解析] 步骤1: 尝试文本提取...');
  const rawText = await extractTextFromPdf(pdfBuffer);
  console.log(`[简历解析] 文本提取结果: ${rawText ? rawText.length + '字符' : '空'}`);

  let parsed;

  if (rawText && rawText.length >= 20) {
    // 文本型 PDF：直接 LLM 解析
    console.log(`[简历解析] 路径: 文本型, 长度=${rawText.length}, 调用 LLM...`);
    const textForLLM = rawText.length > 8000 ? rawText.slice(0, 8000) : rawText;
    parsed = await parseWithTextLLM(textForLLM);
    parsed.raw_text = rawText;
    parsed.parse_method = 'text';
  } else {
    // 扫描件/图片型 PDF：渲染为图片后用视觉模型
    console.log(`[简历解析] 路径: 图片型(扫描件), 文本为空或过短, 渲染PDF...`);
    let images = [];
    try {
      images = await pdfToImages(pdfBuffer, 3);
    } catch (imgErr) {
      console.error('[简历解析] 图片渲染失败:', imgErr.message);
      throw new Error(`PDF 渲染为图片失败: ${imgErr.message}`);
    }

    if (images.length === 0) {
      throw new Error('PDF 无法解析：既非文本型也非可渲染的图片型 PDF');
    }

    console.log(`[简历解析] 渲染了 ${images.length} 页, 调用视觉模型...`);
    parsed = await parseWithVisionLLM(images);
    parsed.raw_text = '';
    parsed.parse_method = 'vision';
  }

  console.log(`[简历解析] 完成, 总耗时: ${Date.now() - t0}ms, 方法: ${parsed.parse_method}`);
  return parsed;
}

module.exports = { parseResume, extractTextFromPdf };
