"use client";

import { useCallback, useState } from "react";
import { Download, ImageIcon, Loader2, Trash2, Upload, Wand2 } from "lucide-react";
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

const STYLE_PRESETS = [
  ["white", "白底简约", "高端白底影棚光，商品居中，干净留白"],
  ["lifestyle", "生活场景", "自然窗光与真实生活场景，突出使用氛围"],
  ["detail", "质感特写", "微距材质细节，强调纹理、工艺和品质"],
  ["gift", "礼盒开箱", "精致礼赠氛围，层次丰富但商品主体清晰"],
  ["minimal", "极简艺术", "克制背景、柔和阴影、现代设计感"],
  ["seasonal", "季节氛围", "结合季节色彩与场景，但不遮挡商品信息"],
] as const;

type ResultItem = {
  index: number;
  style: string;
  success: boolean;
  imageUrl: string | null;
  error?: string;
};

export default function HeroBatchPage() {
  const [images, setImages] = useState<string[]>([]);
  const [productPrompt, setProductPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "3:4" | "9:16">("1:1");
  const [selectedStyles, setSelectedStyles] = useState<string[]>(["white", "lifestyle", "detail", "minimal"]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const readFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const available = PRODUCT_ANALYSIS_MAX_IMAGES - images.length;
    if (available <= 0) {
      toast.error("最多上传 " + PRODUCT_ANALYSIS_MAX_IMAGES + " 张参考图");
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
        setResults([]);
      }
      if (prepared.length !== next.length) toast.error("部分参考图无法读取");
    } finally {
      setPreparing(false);
    }
  }, [images.length]);

  const toggleStyle = (id: string) => {
    setSelectedStyles((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 8 ? current : [...current, id]);
  };

  const generate = async () => {
    if (!images.length) {
      toast.error("请先上传商品参考图");
      return;
    }
    if (!selectedStyles.length) {
      toast.error("请至少选择一种主图风格");
      return;
    }
    setGenerating(true);
    setResults([]);
    try {
      const response = await fetch("/api/hero-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImages: images,
          productPrompt,
          aspectRatio,
          styles: selectedStyles.map((id) => STYLE_PRESETS.find((item) => item[0] === id)?.[2] ?? id),
        }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? "批量主图生成失败");
      setResults(payload.data.results ?? []);
      const successCount = (payload.data.results ?? []).filter((item: ResultItem) => item.success).length;
      toast.success("已完成 " + successCount + "/" + selectedStyles.length + " 张主图");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量主图生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Wand2 className="h-6 w-6" />批量主图</h1>
        <p className="mt-2 text-sm text-muted-foreground">上传多张商品参考图，选择多个视觉方向，一次生成一组主图。</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>参考图与生成设置</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Input id="hero-batch-upload" type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void readFiles(event.target.files); event.currentTarget.value = ""; }} />
            <label htmlFor="hero-batch-upload" className="block cursor-pointer rounded-2xl border border-dashed border-border p-4 text-center">
              {images.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((image, index) => (
                    <div key={image.slice(-24) + index} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                      <img src={image} alt={"参考图 " + (index + 1)} className="h-full w-full object-cover" />
                      <button type="button" className="absolute right-1 top-1 hidden rounded-full bg-black/65 p-1 text-white group-hover:block" onClick={(event) => { event.preventDefault(); setImages((current) => current.filter((_, item) => item !== index)); }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : <div className="py-10 text-muted-foreground"><Upload className="mx-auto h-8 w-8" /><p className="mt-3 text-sm">点击选择或拖入商品参考图</p></div>}
            </label>
            <div className="space-y-2"><Label>商品补充信息（可选）</Label><Textarea rows={4} value={productPrompt} onChange={(event) => setProductPrompt(event.target.value)} placeholder="例如：春季礼盒、主打轻盈、防水面料；仅填写可确认信息" /></div>
            <div className="space-y-2"><Label>画面比例</Label><select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}><option value="1:1">1:1 正方形</option><option value="3:4">3:4 竖图</option><option value="9:16">9:16 长图</option></select></div>
            <div className="space-y-2"><Label>主图风格（已选 {selectedStyles.length} 种）</Label><div className="grid grid-cols-2 gap-2">{STYLE_PRESETS.map(([id, label, description]) => <button type="button" key={id} onClick={() => toggleStyle(id)} className={"rounded-xl border p-3 text-left text-xs transition " + (selectedStyles.includes(id) ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}><p className="font-medium">{label}</p><p className="mt-1 line-clamp-2 text-muted-foreground">{description}</p></button>)}</div></div>
            <Button className="w-full" onClick={generate} disabled={preparing || generating || !images.length}>{preparing || generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}{preparing ? "正在优化参考图…" : generating ? "正在批量生成…" : "生成批量主图"}</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>生成结果 {results.length ? <Badge variant="outline">{results.length} 张</Badge> : null}</CardTitle></CardHeader>
          <CardContent>
            {!results.length ? <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-muted-foreground"><ImageIcon className="h-12 w-12" /><p className="mt-4 text-sm">生成后会在这里展示主图结果</p></div> : <div className="grid gap-4 sm:grid-cols-2">{results.map((item) => <div key={item.index} className="overflow-hidden rounded-2xl border border-border">{item.imageUrl ? <img src={item.imageUrl} alt={"批量主图 " + (item.index + 1)} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-muted p-4 text-center text-xs text-destructive">{item.error ?? "生成失败"}</div>}<div className="flex items-center justify-between gap-2 p-3"><span className="truncate text-xs text-muted-foreground">{item.style}</span>{item.imageUrl ? <a href={item.imageUrl} download={"hero-" + (item.index + 1) + ".png"} className="inline-flex h-8 items-center rounded-lg border border-input px-2 text-xs hover:bg-muted"><Download className="mr-1 h-3.5 w-3.5" />下载</a> : null}</div></div>)}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
