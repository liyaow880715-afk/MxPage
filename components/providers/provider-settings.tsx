"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronsUpDown, CopyPlus, History, Loader2, LockKeyhole, PlugZap, Plus, X } from "lucide-react";

import { CLIENT_PROVIDER_STORAGE_KEY } from "@/components/layout/provider-credential-fetch-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProviderModelRecord = {
  modelId: string;
  label: string;
  capabilities: Record<string, unknown>;
  roles: Record<string, unknown>;
  quality?: string | null;
  latency?: string | null;
  cost?: string | null;
  isAvailable: boolean;
  endpointSupport?: {
    imageGeneration: string;
    imageEdit: string;
    note?: string | null;
  };
  endpointSource?: "text" | "image" | "both";
  isDefaultAnalysis: boolean;
  isDefaultPlanning: boolean;
  isDefaultHeroImage: boolean;
  isDefaultDetailImage: boolean;
  isDefaultImageEdit: boolean;
};

type ProviderRecord = {
  id: string;
  name: string;
  baseUrl: string;
  imageBaseUrl?: string;
  apiKey?: string;
  maskedApiKey?: string;
  temperature?: number | null;
  reasoningEffort?: "low" | "medium" | "high" | null;
  isActive: boolean;
  updatedAt: string | Date;
  models: ProviderModelRecord[];
};

type RuntimeConfig = {
  baseUrlLocked?: boolean;
  lockedBaseUrl?: string | null;
  imageBaseUrlLocked?: boolean;
  lockedImageBaseUrl?: string | null;
};

interface ProviderSettingsProps {
  initialProviders: ProviderRecord[];
  runtimeConfig?: RuntimeConfig;
}

type DefaultAssignments = {
  analysisModelId: string;
  planningModelId: string;
  heroImageModelId: string;
  detailImageModelId: string;
  imageEditModelId: string;
};

type ModelTypeKey = "text" | "vision" | "image_gen" | "image_edit";
type GenericModelRecord = ProviderModelRecord | Record<string, any>;
type ProbeSummary = {
  textCount: number;
  imageCount: number;
  imageError: string | null;
};

const modelTypeFields: Array<{ key: ModelTypeKey; label: string }> = [
  { key: "text", label: "文本生成模型" },
  { key: "vision", label: "图像识别模型" },
  { key: "image_gen", label: "图像生成模型" },
  { key: "image_edit", label: "图像编辑模型" },
];

const preferredGptTextModelIds = [
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1",
];

function normalizeModelId(modelId: string) {
  return modelId.toLowerCase().replace(/[^a-z0-9.]+/g, "");
}

function getModelText(model: GenericModelRecord) {
  return `${model.modelId ?? ""} ${model.label ?? ""}`.toLowerCase();
}

function isUtilityModel(model: GenericModelRecord) {
  return /(embedding|embed|rerank|ranker|moderation|whisper|tts|speech|transcrib|audio|sora|video)/.test(getModelText(model));
}

function isTextGenerationModel(model: GenericModelRecord) {
  return (
    !isUtilityModel(model) &&
    (Boolean(model.capabilities?.text) ||
      /(^|[-_])o[1345](?:[-_]|$)|gpt|chat|instruct|completion|responses|reasoner|qwen|glm|deepseek|kimi|claude|llama|mistral|moonshot/.test(
        getModelText(model),
      ))
  );
}

function isVisionModel(model: GenericModelRecord) {
  return Boolean(model.capabilities?.vision) || /(vision|vl|4o|omni|multimodal|gpt-4\.1|gpt-5|qwen-vl|qvq|pixtral|visual)/.test(getModelText(model));
}

function isImageGenerationModel(model: GenericModelRecord) {
  return Boolean(model.capabilities?.image_gen) || /(gpt[-_\s]?image|chatgpt-image|dall[-_ ]?e|image|imagen|flux|recraft|seedream|jimeng|midjourney|ideogram|cogview)/.test(getModelText(model));
}

function isImageEditModel(model: GenericModelRecord) {
  return Boolean(model.capabilities?.image_edit) || /(gpt[-_\s]?image|chatgpt-image|edit|inpaint|mask|retouch|erase|remove.?background)/.test(getModelText(model));
}

function isImageProductionModel(model: GenericModelRecord) {
  return isImageGenerationModel(model) || isImageEditModel(model);
}

function uniqueModels(models: GenericModelRecord[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    const key = String(model.modelId ?? model.label ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPreferredGptTextModel(model: GenericModelRecord) {
  const normalized = normalizeModelId(String(model.modelId ?? model.label ?? ""));
  return preferredGptTextModelIds.map(normalizeModelId).includes(normalized);
}

function isPreferredGptImage2(model: GenericModelRecord) {
  const modelId = String(model.modelId ?? model.label ?? "");
  const normalized = normalizeModelId(modelId);
  return normalized === "gptimage2" || /^gpt[-_\s]?image[-_\s]?2(?:[-_\s]|$)/i.test(modelId);
}

function canUseForModelType(model: GenericModelRecord, typeKey: ModelTypeKey) {
  if (typeKey === "text") return isTextGenerationModel(model) && !isImageProductionModel(model);
  if (typeKey === "vision") return isVisionModel(model) && !isImageProductionModel(model);
  if (typeKey === "image_gen") return isImageGenerationModel(model);
  return isImageEditModel(model);
}

function scoreModelForType(model: GenericModelRecord, typeKey: ModelTypeKey) {
  let score = 0;
  const text = getModelText(model);
  if ((typeKey === "text" || typeKey === "vision") && isPreferredGptTextModel(model)) score += 100;
  if ((typeKey === "image_gen" || typeKey === "image_edit") && isPreferredGptImage2(model)) score += 100;
  if (/gpt/i.test(text)) score += 20;
  if (/(mini|nano|lite|turbo|flash)/i.test(text)) score += 8;
  if (/(preview|experimental|beta|test|deprecated|legacy)/i.test(text)) score -= 10;
  if (/gpt[-_\s]?5\.5|pro|max|ultra/i.test(text) && (typeKey === "text" || typeKey === "vision")) score -= 20;
  return score;
}

function getModelsForType(models: GenericModelRecord[], typeKey: ModelTypeKey) {
  return uniqueModels(models.filter((model) => canUseForModelType(model, typeKey))).sort((left, right) => {
    const diff = scoreModelForType(right, typeKey) - scoreModelForType(left, typeKey);
    if (diff !== 0) return diff;
    return String(left.modelId ?? left.label).localeCompare(String(right.modelId ?? right.label));
  });
}

function buildDefaults(provider: ProviderRecord | null): DefaultAssignments {
  return {
    analysisModelId: provider?.models.find((item) => item.isDefaultAnalysis)?.modelId ?? "",
    planningModelId: provider?.models.find((item) => item.isDefaultPlanning)?.modelId ?? "",
    heroImageModelId: provider?.models.find((item) => item.isDefaultHeroImage)?.modelId ?? "",
    detailImageModelId: provider?.models.find((item) => item.isDefaultDetailImage)?.modelId ?? "",
    imageEditModelId: provider?.models.find((item) => item.isDefaultImageEdit)?.modelId ?? "",
  };
}

function getTypeDefaultValue(defaults: DefaultAssignments, typeKey: ModelTypeKey) {
  if (typeKey === "text") return defaults.planningModelId;
  if (typeKey === "vision") return defaults.analysisModelId;
  if (typeKey === "image_gen") return defaults.heroImageModelId || defaults.detailImageModelId;
  return defaults.imageEditModelId;
}

function setTypeDefaultValue(defaults: DefaultAssignments, typeKey: ModelTypeKey, modelId: string): DefaultAssignments {
  if (typeKey === "text") return { ...defaults, planningModelId: modelId };
  if (typeKey === "vision") return { ...defaults, analysisModelId: modelId };
  if (typeKey === "image_gen") return { ...defaults, heroImageModelId: modelId, detailImageModelId: modelId };
  return { ...defaults, imageEditModelId: modelId };
}

function pickModel(models: GenericModelRecord[], predicates: Array<(model: GenericModelRecord) => boolean>) {
  for (const predicate of predicates) {
    const matched = models.find(predicate);
    if (matched?.modelId) return String(matched.modelId);
  }
  return "";
}

function buildRecommendedDefaults(models: GenericModelRecord[]): DefaultAssignments {
  const visionModels = getModelsForType(models, "vision");
  const textModels = getModelsForType(models, "text");
  const imageGenerationModels = getModelsForType(models, "image_gen");
  const imageEditModels = getModelsForType(models, "image_edit");
  const textDefault = pickModel(textModels, [isPreferredGptTextModel, (model) => /gpt/i.test(getModelText(model)), () => true]);
  const visionDefault = pickModel(visionModels, [isPreferredGptTextModel, (model) => /gpt/i.test(getModelText(model)), () => true]);
  const imageDefault = pickModel(imageGenerationModels, [isPreferredGptImage2, (model) => /gpt[-_\s]?image/i.test(getModelText(model)), () => true]);
  const editDefault = pickModel(imageEditModels, [isPreferredGptImage2, (model) => /gpt[-_\s]?image/i.test(getModelText(model)), () => true]);
  return {
    analysisModelId: visionDefault || textDefault,
    planningModelId: textDefault,
    heroImageModelId: imageDefault,
    detailImageModelId: imageDefault,
    imageEditModelId: editDefault || imageDefault,
  };
}

function formatTimeLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readStoredCredentials() {
  if (typeof window === "undefined") return { apiKey: "", baseUrl: "", imageApiKey: "", imageBaseUrl: "" };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLIENT_PROVIDER_STORAGE_KEY) || "{}") as {
      apiKey?: string;
      baseUrl?: string;
      imageApiKey?: string;
      imageBaseUrl?: string;
    };
    const apiKey = parsed.apiKey ?? "";
    const baseUrl = parsed.baseUrl ?? "";
    return {
      apiKey,
      baseUrl,
      imageApiKey: parsed.imageApiKey ?? apiKey,
      imageBaseUrl: parsed.imageBaseUrl ?? baseUrl,
    };
  } catch {
    return { apiKey: "", baseUrl: "", imageApiKey: "", imageBaseUrl: "" };
  }
}

function writeStoredCredentials(values: { apiKey: string; baseUrl: string; imageApiKey: string; imageBaseUrl: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CLIENT_PROVIDER_STORAGE_KEY,
    JSON.stringify({
      apiKey: values.apiKey.trim(),
      baseUrl: values.baseUrl.trim(),
      imageApiKey: values.imageApiKey.trim(),
      imageBaseUrl: values.imageBaseUrl.trim(),
    }),
  );
}

export function ProviderSettings({ initialProviders, runtimeConfig }: ProviderSettingsProps) {
  const lockedBaseUrl = runtimeConfig?.lockedBaseUrl ?? "";
  const lockedImageBaseUrl = runtimeConfig?.lockedImageBaseUrl || lockedBaseUrl;
  const baseUrlLocked = Boolean(runtimeConfig?.baseUrlLocked && lockedBaseUrl);
  const imageBaseUrlLocked = Boolean((runtimeConfig?.imageBaseUrlLocked || baseUrlLocked) && lockedImageBaseUrl);
  const [providers, setProviders] = useState(initialProviders);
  const activeProvider = useMemo(() => providers.find((item) => item.isActive) ?? providers[0] ?? null, [providers]);
  const [selectedProviderId, setSelectedProviderId] = useState(activeProvider?.id ?? "");
  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === selectedProviderId) ?? activeProvider,
    [providers, selectedProviderId, activeProvider],
  );
  const [loading, setLoading] = useState<null | "discover" | "save" | "saveAsNew" | "activate">(null);
  const [models, setModels] = useState<Array<GenericModelRecord>>(selectedProvider?.models ?? []);
  const [defaults, setDefaults] = useState<DefaultAssignments>(buildDefaults(selectedProvider ?? null));
  const [probeSummary, setProbeSummary] = useState<ProbeSummary | null>(null);
  const [temperature, setTemperature] = useState(selectedProvider?.temperature ?? 0.4);
  const [reasoningEffort, setReasoningEffort] = useState<"" | "low" | "medium" | "high">(selectedProvider?.reasoningEffort ?? "");
  const [isAddingManualModel, setIsAddingManualModel] = useState(false);
  const [manualModelId, setManualModelId] = useState("");
  const [manualModelLabel, setManualModelLabel] = useState("");
  const [manualCapabilities, setManualCapabilities] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    id: selectedProvider?.id ?? "",
    name: selectedProvider?.name ?? "默认 GPT 模型服务",
    baseUrl: lockedBaseUrl || selectedProvider?.baseUrl || "https://api.openai-proxy.org/v1",
    imageBaseUrl: lockedImageBaseUrl || selectedProvider?.imageBaseUrl || selectedProvider?.baseUrl || "https://api.openai-proxy.org/v1",
    apiKey: "",
    imageApiKey: "",
  });

  useEffect(() => {
    const stored = readStoredCredentials();
    setForm((current) => ({
      ...current,
      baseUrl: lockedBaseUrl || stored.baseUrl || current.baseUrl,
      apiKey: stored.apiKey || current.apiKey,
      imageBaseUrl: lockedImageBaseUrl || stored.imageBaseUrl || current.imageBaseUrl,
      imageApiKey: stored.imageApiKey || current.imageApiKey,
    }));
  }, [lockedBaseUrl, lockedImageBaseUrl]);

  useEffect(() => {
    const stored = readStoredCredentials();
    const nextProvider = selectedProvider ?? null;
    setModels(nextProvider?.models ?? []);
    setDefaults(buildDefaults(nextProvider));
    setTemperature(nextProvider?.temperature ?? 0.4);
    setReasoningEffort(nextProvider?.reasoningEffort ?? "");
    setIsAddingManualModel(false);
    setManualModelId("");
    setManualModelLabel("");
    setManualCapabilities({});
    setForm({
      id: nextProvider?.id ?? "",
      name: nextProvider?.name ?? "默认 GPT 模型服务",
      baseUrl: lockedBaseUrl || nextProvider?.baseUrl || stored.baseUrl || "https://api.openai-proxy.org/v1",
      imageBaseUrl: lockedImageBaseUrl || nextProvider?.imageBaseUrl || nextProvider?.baseUrl || stored.imageBaseUrl || stored.baseUrl || "https://api.openai-proxy.org/v1",
      apiKey: stored.apiKey,
      imageApiKey: stored.imageApiKey,
    });
  }, [selectedProvider, lockedBaseUrl, lockedImageBaseUrl]);

  type ProviderSubmitValues = ReturnType<typeof currentSubmitValues>;

  const capabilityGroups = useMemo(
    () =>
      modelTypeFields
        .map((field) => ({
          ...field,
          models: getModelsForType(models, field.key),
        }))
        .filter((group) => group.models.length > 0),
    [models],
  );

  function updateForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function currentSubmitValues() {
    const textBaseUrl = baseUrlLocked ? lockedBaseUrl : form.baseUrl.trim();
    const imageBaseUrl = imageBaseUrlLocked ? lockedImageBaseUrl : form.imageBaseUrl.trim() || textBaseUrl;
    const textApiKey = form.apiKey.trim();
    const imageApiKey = form.imageApiKey.trim() || textApiKey;
    return {
      id: form.id || undefined,
      name: form.name.trim() || "默认 GPT 模型服务",
      baseUrl: textBaseUrl,
      apiKey: textApiKey,
      imageBaseUrl,
      imageApiKey,
      temperature: Number.isFinite(temperature) ? temperature : 0.4,
      reasoningEffort: reasoningEffort || null,
      isActive: true,
    };
  }

  function persistCurrentCredentials() {
    const values = currentSubmitValues();
    writeStoredCredentials({
      apiKey: values.apiKey,
      baseUrl: values.baseUrl,
      imageApiKey: values.imageApiKey,
      imageBaseUrl: values.imageBaseUrl,
    });
    return values;
  }

  function hydrateFromProviderPayload(data: any, nextSelectedId?: string | null) {
    const nextProviders: ProviderRecord[] = Array.isArray(data) ? data : data?.providers ?? [];
    setProviders(nextProviders);
    const fallbackId = nextSelectedId ?? nextProviders.find((item) => item.isActive)?.id ?? nextProviders[0]?.id ?? "";
    setSelectedProviderId(fallbackId);
  }

  async function handleActivateProvider(providerId: string) {
    setLoading("activate");
    try {
      const response = await fetch("/api/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? "切换历史服务失败");
      hydrateFromProviderPayload(payload.data, providerId);
      toast.success("已切换为当前服务");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换历史服务失败");
    } finally {
      setLoading(null);
    }
  }

  async function discoverProviderModels(values: ProviderSubmitValues) {
    const response = await fetch("/api/providers/discover-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error?.message ?? "模型发现失败");

    const discoveredModels = payload.data.models ?? [];
    const recommendedDefaults = payload.data.recommendations ?? buildRecommendedDefaults(discoveredModels);
    return {
      discoveredModels,
      recommendedDefaults,
      probeSummary: {
        textCount: Array.isArray(payload.data.textModels) ? payload.data.textModels.length : 0,
        imageCount: Array.isArray(payload.data.imageModels) ? payload.data.imageModels.length : 0,
        imageError: typeof payload.data.imageError === "string" ? payload.data.imageError : null,
      },
    };
  }

  async function persistProviderConfig(values: ProviderSubmitValues, overwriteExisting: boolean, discoveredModels = models, recommendedDefaults = defaults) {
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        id: overwriteExisting ? values.id : undefined,
        defaultAssignments: recommendedDefaults,
        discoveredModels,
      }),
    });
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error?.message ?? "配置保存失败");

    const savedProviderId = payload.data?.savedProviderId ?? values.id ?? "";
    hydrateFromProviderPayload(payload.data, savedProviderId);
  }

  async function handleDiscoverModels() {
    setLoading("discover");
    try {
      const values = currentSubmitValues();
      const { discoveredModels, recommendedDefaults, probeSummary: nextProbeSummary } = await discoverProviderModels(values);
      setModels(discoveredModels);
      setDefaults(recommendedDefaults);
      setProbeSummary(nextProbeSummary);
      toast.success(`文字 / 视觉接口 ${nextProbeSummary.textCount} 个，图像生成 / 编辑接口 ${nextProbeSummary.imageCount} 个，尚未保存配置`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型探测失败");
    } finally {
      setLoading(null);
    }
  }

  async function saveCurrentProvider() {
    setLoading("save");
    try {
      const values = persistCurrentCredentials();
      await persistProviderConfig(values, true);
      toast.success("配置已保存，API Key 仅保存在当前浏览器");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setLoading(null);
    }
  }

  async function saveProviderAsNew() {
    setLoading("saveAsNew");
    try {
      const values = persistCurrentCredentials();
      await persistProviderConfig(values, false);
      toast.success("已另存为新服务，API Key 仅保存在本地浏览器");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setLoading(null);
    }
  }
  function handleAutoFillDefaults() {
    setDefaults(buildRecommendedDefaults(models));
    toast.success("已按 GPT 优先和模型能力自动填充默认模型");
  }

  function handleAddManualModel() {
    const modelId = manualModelId.trim();
    if (!modelId) {
      toast.error("请输入模型 ID");
      return;
    }
    if (models.some((model) => String(model.modelId ?? "").toLowerCase() === modelId.toLowerCase())) {
      toast.error("该模型已经在列表中");
      return;
    }

    const capabilities = {
      text: Boolean(manualCapabilities.text),
      vision: Boolean(manualCapabilities.vision),
      structured_output: Boolean(manualCapabilities.structured_output),
      image_gen: Boolean(manualCapabilities.image_gen),
      image_edit: Boolean(manualCapabilities.image_edit),
      high_quality: Boolean(manualCapabilities.image_gen || manualCapabilities.image_edit),
    };
    const roles = {
      analysis: capabilities.text || capabilities.vision,
      planning: capabilities.text,
      hero_image: capabilities.image_gen,
      detail_image: capabilities.image_gen,
      image_edit: capabilities.image_edit,
    };
    const manualModel: GenericModelRecord = {
      modelId,
      label: manualModelLabel.trim() || modelId,
      capabilities,
      roles,
      quality: null,
      latency: null,
      cost: null,
      isAvailable: true,
      endpointSource: "both",
      endpointSupport: {
        imageGeneration: capabilities.image_gen ? "unknown" : "not_applicable",
        imageEdit: capabilities.image_edit ? "unknown" : "not_applicable",
        note: "手动添加的模型，未经过端点探测",
      },
      isDefaultAnalysis: false,
      isDefaultPlanning: false,
      isDefaultHeroImage: false,
      isDefaultDetailImage: false,
      isDefaultImageEdit: false,
    };
    setModels((current) => [...current, manualModel]);
    setManualModelId("");
    setManualModelLabel("");
    setManualCapabilities({});
    setIsAddingManualModel(false);
    toast.success(`已添加模型：${manualModel.label}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>模型服务连接</CardTitle>
          <CardDescription>API Key 只保存在当前浏览器。本地保存后，请求时临时传给后端，不写入服务器配置。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {baseUrlLocked ? (
            <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <LockKeyhole className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">当前平台已锁定专属 API 服务通道</p>
                <p className="mt-1 text-xs opacity-80">前端填写的 baseURL 会被后端忽略，所有模型请求统一走部署方配置的 LOCK_BASE_URL。</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 rounded-3xl border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">历史服务快照</h3>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex-1 space-y-2">
                <Label htmlFor="provider-history">历史服务</Label>
                <div className="relative">
                  <select
                    id="provider-history"
                    className="flex h-10 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-10 text-sm text-foreground dark:bg-black/30"
                    value={selectedProviderId}
                    onChange={(event) => setSelectedProviderId(event.target.value)}
                  >
                    {providers.length === 0 ? <option value="">暂无已保存服务</option> : null}
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                        {provider.name} / {provider.baseUrl}
                  </option>
                ))}
                  </select>
                  <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" variant={selectedProvider?.isActive ? "secondary" : "default"} onClick={() => selectedProviderId && handleActivateProvider(selectedProviderId)} disabled={!selectedProviderId || selectedProvider?.isActive || loading !== null}>
                  {loading === "activate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {selectedProvider?.isActive ? "当前使用中" : "切换为当前服务"}
                </Button>
              </div>
            </div>
            {selectedProvider ? (
              <div className="rounded-2xl border border-border bg-background p-4 dark:bg-black/20">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{selectedProvider.name}</p>
                  {selectedProvider.isActive ? <Badge variant="success">当前服务</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">文本 / 视觉：{selectedProvider.baseUrl}</p>
                <p className="mt-1 text-sm text-muted-foreground">图像生成 / 编辑：{selectedProvider.imageBaseUrl || selectedProvider.baseUrl}</p>
                <p className="mt-1 text-xs text-muted-foreground">Key：仅保存在当前浏览器</p>
                <p className="mt-1 text-xs text-muted-foreground">最近更新：{formatTimeLabel(selectedProvider.updatedAt)}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">首次使用时，请填写 API Key 并发现模型。</div>
            )}
          </div>

          <form autoComplete="off" className="grid gap-4 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="provider-name">服务名称</Label>
              <Input id="provider-name" autoComplete="off" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="默认 GPT 模型服务" />
            </div>
            <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-4 md:col-span-2">
              <div>
                <p className="text-sm font-medium">文字 + 图像识别接口</p>
                <p className="mt-1 text-xs text-muted-foreground">用于文本生成、结构化输出和商品图像识别。</p>
              </div>
              {!baseUrlLocked ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-base-url">baseURL</Label>
                  <Input id="provider-base-url" inputMode="url" autoComplete="off" autoCapitalize="none" value={form.baseUrl} onChange={(event) => updateForm({ baseUrl: event.target.value })} placeholder="https://your-text-provider.example/v1" />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="provider-api-key">API Key</Label>
                <Input id="provider-api-key" type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => updateForm({ apiKey: event.target.value })} placeholder="请输入文字 / 视觉接口 API Key" />
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-4 md:col-span-2">
              <div>
                <p className="text-sm font-medium">图片生成 + 编辑接口</p>
                <p className="mt-1 text-xs text-muted-foreground">留空时沿用上面的接口和 API Key。</p>
              </div>
              {!imageBaseUrlLocked ? (
                <div className="space-y-2">
                  <Label htmlFor="provider-image-base-url">baseURL</Label>
                  <Input id="provider-image-base-url" inputMode="url" autoComplete="off" autoCapitalize="none" value={form.imageBaseUrl} onChange={(event) => updateForm({ imageBaseUrl: event.target.value })} placeholder="https://your-image-provider.example/v1" />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="provider-image-api-key">API Key</Label>
                <Input id="provider-image-api-key" type="password" autoComplete="new-password" value={form.imageApiKey} onChange={(event) => updateForm({ imageApiKey: event.target.value })} placeholder="可选，留空沿用文字 / 视觉接口 Key" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">API Key 只会在点击“保存配置”后写入当前浏览器 localStorage，不会保存到服务器数据库。</p>
          </form>

          <div className="grid gap-4 rounded-3xl border border-border bg-muted/25 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="provider-temperature">Temperature（文本生成温度）</Label>
                <span className="text-xs font-medium tabular-nums">{temperature.toFixed(2)}</span>
              </div>
              <input
                id="provider-temperature"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">较低值更稳定，较高值更发散。部分推理模型会自动忽略该参数。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-reasoning-effort">Reasoning Effort（推理深度）</Label>
              <select
                id="provider-reasoning-effort"
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground dark:bg-black/30"
                value={reasoningEffort}
                onChange={(event) => setReasoningEffort(event.target.value as "" | "low" | "medium" | "high")}
              >
                <option value="">自动 / 不发送</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="text-xs text-muted-foreground">仅对接口支持的 reasoning / thinking 模型发送。</p>
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-border bg-muted/35 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">模型探测与保存</p>
                <p className="text-xs leading-6 text-muted-foreground">
                  只读取两个接口实际返回的可用模型，不会自动保存。确认模型和默认分配后，再手动保存配置。
                </p>
              </div>
              <Button type="button" onClick={handleDiscoverModels} disabled={loading !== null || !form.apiKey.trim()} className="h-11 shrink-0 gap-2 px-5">
                {loading === "discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                {loading === "discover" ? "正在探测模型..." : "探测可用模型"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
              <p className="text-xs text-muted-foreground">保存动作由你手动触发；另存为新服务不会覆盖历史配置。</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={saveCurrentProvider} disabled={loading !== null || !form.apiKey.trim()}>
                  {loading === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  保存配置
                </Button>
                <Button type="button" variant="outline" onClick={saveProviderAsNew} disabled={loading !== null || !form.apiKey.trim()}>
                {loading === "saveAsNew" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CopyPlus className="mr-2 h-4 w-4" />}
                另存为新服务
                </Button>
              </div>
            </div>
            {probeSummary ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                <span>文字 / 视觉接口：{probeSummary.textCount} 个模型</span>
                <span>图像生成 / 编辑接口：{probeSummary.imageCount} 个模型</span>
                {probeSummary.imageError ? <span className="text-destructive">图像接口探测失败：{probeSummary.imageError}</span> : null}
              </div>
            ) : null}
          </div>

          {models.length > 0 ? (
            <div className="space-y-4 rounded-3xl bg-muted/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">默认模型类型分配</h3>
                  <Badge>{models.length} 个模型</Badge>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAutoFillDefaults}>按 GPT 优先自动填充</Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {modelTypeFields.map((field) => {
                  const options = getModelsForType(models, field.key);
                  const selectedValue = getTypeDefaultValue(defaults, field.key);
                  return (
                    <div key={field.key} className="space-y-2">
                      <Label>{field.label}</Label>
                      <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground dark:bg-black/30" value={selectedValue} disabled={options.length === 0} onChange={(event) => setDefaults((current) => setTypeDefaultValue(current, field.key, event.target.value))}>
                        <option value="">{options.length === 0 ? "暂无此类型模型" : "未选择"}</option>
                        {options.map((model) => (
                          <option key={`${field.key}-${model.modelId}`} value={model.modelId}>{model.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <Button type="button" variant="outline" onClick={() => setIsAddingManualModel((current) => !current)} disabled={loading !== null}>
              <Plus className="mr-2 h-4 w-4" />
              手动添加模型
            </Button>
            {isAddingManualModel ? (
              <div className="space-y-4 rounded-3xl border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">手动添加模型</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingManualModel(false)} aria-label="关闭手动添加模型">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="manual-model-id">模型 ID</Label>
                    <Input id="manual-model-id" placeholder="例如：moonshot-v1-128k 或 dall-e-3" value={manualModelId} onChange={(event) => setManualModelId(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-model-label">显示名称（可选）</Label>
                    <Input id="manual-model-label" placeholder={manualModelId || "默认使用模型 ID"} value={manualModelLabel} onChange={(event) => setManualModelLabel(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>能力标签</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["text", "文本"],
                      ["vision", "视觉理解"],
                      ["structured_output", "结构化输出"],
                      ["image_gen", "图像生成"],
                      ["image_edit", "图像编辑"],
                    ].map(([key, label]) => {
                      const enabled = Boolean(manualCapabilities[key]);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setManualCapabilities((current) => ({ ...current, [key]: !current[key] }))}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50"}`}
                        >
                          {enabled ? "✓ " : ""}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button type="button" onClick={handleAddManualModel} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  确认添加
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型能力分组</CardTitle>
          <CardDescription>只展示最近一次从配置接口实际探测到的模型。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {models.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground">先发现模型，系统会按能力类型展示可用模型。</div>
          ) : (
            <div className="grid gap-4">
              {capabilityGroups.map((group) => {
                const visibleModels = group.models.slice(0, 18);
                const hiddenCount = Math.max(0, group.models.length - visibleModels.length);
                return (
                  <div key={group.key} className="rounded-3xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{group.label}</h3>
                      <Badge variant="outline">{group.models.length} 个模型</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {visibleModels.map((model) => (
                        <Badge key={`${group.key}-${model.modelId}`} variant="outline" className="max-w-full truncate">{model.label}</Badge>
                      ))}
                      {hiddenCount > 0 ? <Badge>+ {hiddenCount} 个</Badge> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
