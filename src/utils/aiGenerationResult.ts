interface GenerationResult {
  success?: boolean;
  error?: string;
  message?: string;
  results?: Array<{ success?: boolean; error?: string }>;
}

export function getAiGenerationError(result: GenerationResult, httpStatus: number): string | null {
  if (httpStatus >= 200 && httpStatus < 300 && (result.success || result.results?.[0]?.success)) {
    return null;
  }
  return result.results?.[0]?.error || result.error || result.message ||
    (httpStatus >= 400 ? `AI 接口返回 HTTP ${httpStatus}` : 'AI 生成失败，接口未返回错误详情');
}
