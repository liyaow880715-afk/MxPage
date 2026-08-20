"use client";

import { useCallback, useState } from "react";
import { Check, Copy, ImageIcon, Loader2, ScanSearch, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  prepareProductAnalysisImage,
  PRODUCT_ANALYSIS_MAX_IMAGES,
} from "@/lib/utils/product-analysis-image";

type AnalysisResult = {
  productName: string;
  category: string;
  material: string;
  color: string;
  sellingPoints: string[];
  description: string;
  targetAudience: string;
  usageScenarios: string[];
  numericClaims: string[];
  specs: Array<{ name: string; description: string; highlights: string[] }>;
  imageRoles: string[];
};

function buildSummary(result: AnalysisResult, productName: string, description: string) {
  return [
    "商品名称：" + productName,
    result.category ? "品类：" + result.category : "",
    result.material ? "材质：" + result.material : "",
    result.color ? "颜色：" + result.color : "",
    result.targetAudience ? "目标人群：" + result.targetAudience : "",
    result.sellingPoints.length ? "卖点：" + result.sellingPoints.join("、") : "",
    description,
    result.usageScenarios.length ? "适用场景：" + result.usageScenarios.join("、") : "",
  ].filter(Boolean).join("\n");
}

export default function ProductAnalyzePage() {
  const [images, setImages] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [copied, setCopied] = useState(false);

  const readFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const available = PRODUCT_ANALYSIS_MAX_IMAGES - images.length;
    if (available <= 0) {
      toast.error("最多上传 " + PRODUCT_ANALYSIS_MAX_IMAGES + " 张图片");
      return;
    }
    setPreparing(true);
    try {
      const prepared = await Promise.allSettled(
        Array.from(fileList).slice(0, available).map(prepareProductAnalysisImage),
      );
      const next = prepared
        .filter((item): item is PromiseFulfilledResult<string> => item.status === "fulfilled")
        .map((item) => item.value);
      if (next.length) {
        setImages((current) => [...current, ...next].slice(0, PRODUCT_ANALYSIS_MAX_IMAGES));
        setResult(null);
        setRoles([]);
      }
      const failed = prepared.length - next.length;
      if (failed) toast.error(failed + " 张图片无法读取");
    } finally {
      setPreparing(false);
    }
  }, [images.length]);

  const analyze = async () => {
    if (!images.length) {
      toast.error("请先上传商品图片");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/product-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productImages: images }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? "商品分析失败");
      const next = payload.data as AnalysisResult;
      setResult(next);
      setProductName(next.productName ?? "");
      setDescription(next.description ?? "");
      setRoles(next.imageRoles ?? []);
      toast.success("商品分析完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品分析失败");
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(buildSummary(result, productName, description));
    setCopied(true);
    toast.success("分析结果已复制");
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ScanSearch className="h-6 w-6" />商品分析</h1>
        <p className="mt-2 text-sm text-muted-foreground">上传多张商品图，独立分析商品信息、卖点、规格和图片角色。</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader><CardTitle>商品图片（最多 {PRODUCT_ANALYSIS_MAX_IMAGES} 张）</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input id="standalone-analysis-upload" type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void readFiles(event.target.files); event.currentTarget.value = ""; }} />
            <label htmlFor="standalone-analysis-upload" className="block cursor-pointer rounded-2xl border border-dashed border-border p-4 text-center">
              {images.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((image, index) => (
                    <div key={image.slice(-24) + index} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                      <img src={image} alt={"商品图 " + (index + 1)} className="h-full w-full object-cover" />
                      {roles[index] ? <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">{roles[index]}</span> : null}
                      <button type="button" className="absolute right-1 top-1 hidden rounded-full bg-black/65 p-1 text-white group-hover:block" onClick={(event) => { event.preventDefault(); setImages((current) => current.filter((_, item) => item !== index)); setRoles((current) => current.filter((_, item) => item !== index)); }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {images.length < PRODUCT_ANALYSIS_MAX_IMAGES ? <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border"><Upload className="h-5 w-5 text-muted-foreground" /></div> : null}
                </div>
              ) : (
                <div className="py-12 text-muted-foreground"><Upload className="mx-auto h-9 w-9" /><p className="mt-3 text-sm">点击选择或拖入多张商品图</p></div>
              )}
            </label>
            <Button className="w-full" onClick={analyze} disabled={loading || preparing || !images.length}>
              {loading || preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
              {preparing ? "正在优化图片…" : loading ? "AI 分析中…" : "开始分析"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>分析结果</CardTitle>
            <Button variant="outline" size="sm" onClick={copyResult} disabled={!result}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}复制结果
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-muted-foreground"><ImageIcon className="h-12 w-12" /><p className="mt-4 text-sm">分析完成后会在这里展示可编辑结果</p></div>
            ) : (
              <>
                <div className="space-y-2"><Label>商品名称</Label><Input value={productName} onChange={(event) => setProductName(event.target.value)} /></div>
                <div className="space-y-2"><Label>商品描述</Label><Textarea rows={7} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["category", "品类"],
                    ["material", "材质"],
                    ["color", "颜色"],
                    ["targetAudience", "目标人群"],
                  ].map(([key, label]) => (
                    <div key={key} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{String(result[key as keyof AnalysisResult] ?? "")}</p></div>
                  ))}
                </div>
                {result.sellingPoints.length ? <div><Label>核心卖点</Label><div className="mt-2 flex flex-wrap gap-2">{result.sellingPoints.map((item) => <Badge key={item}>{item}</Badge>)}</div></div> : null}
                {result.specs.length ? <div><Label>规格 / 口味</Label><div className="mt-2 space-y-2">{result.specs.map((item, index) => <div key={item.name + index} className="rounded-xl border border-border p-3"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.description}</p>{item.highlights.length ? <div className="mt-2 flex flex-wrap gap-1">{item.highlights.map((highlight) => <Badge key={highlight} variant="outline">{highlight}</Badge>)}</div> : null}</div>)}</div></div> : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
