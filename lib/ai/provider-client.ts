import { z } from "zod";

export interface AiMonitorContext {
  projectId?: string;
  sectionId?: string;
  operation?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface StructuredRequest<T> {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  images?: string[];
  timeoutMs?: number;
  monitor?: AiMonitorContext;
  suppressUsageLog?: boolean;
}

export interface TextRequest {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  images?: string[];
  timeoutMs?: number;
  monitor?: AiMonitorContext;
  suppressUsageLog?: boolean;
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  aspectRatio?: "1:1" | "3:4" | "9:16";
  referenceImages?: string[];
  timeoutMs?: number;
  monitor?: AiMonitorContext;
}

export interface ImageEditRequest {
  model: string;
  prompt: string;
  image: string;
  mask?: string;
  size?: string;
  aspectRatio?: "1:1" | "3:4" | "9:16";
  referenceImages?: string[];
  timeoutMs?: number;
  monitor?: AiMonitorContext;
}

export interface ImageGenerationResult {
  url?: string | null;
  b64Json?: string | null;
  revisedPrompt?: string | null;
}

export interface ProviderAdapter {
  testConnection(): Promise<{ ok: boolean; providerLabel: string }>;
  listModels(): Promise<Array<{ id: string; label: string; type?: string | null; category?: string | null; modalities?: string[] }>>;
  generateText(input: TextRequest): Promise<{ text: string }>;
  generateStructured<T>(input: StructuredRequest<T>): Promise<{ parsed: T; raw: string }>;
  generateImage(input: ImageGenerationRequest): Promise<ImageGenerationResult>;
  editImage(input: ImageEditRequest): Promise<ImageGenerationResult>;
}

export class RoutedProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly textAdapter: ProviderAdapter,
    private readonly imageAdapter: ProviderAdapter,
  ) {}

  testConnection() {
    return this.textAdapter.testConnection();
  }

  listModels() {
    return this.textAdapter.listModels();
  }

  generateText(input: TextRequest) {
    return this.textAdapter.generateText(input);
  }

  generateStructured<T>(input: StructuredRequest<T>) {
    return this.textAdapter.generateStructured(input);
  }

  generateImage(input: ImageGenerationRequest) {
    return this.imageAdapter.generateImage(input);
  }

  editImage(input: ImageEditRequest) {
    return this.imageAdapter.editImage(input);
  }
}
