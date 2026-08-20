"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";

function buildDraftProjectName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];

  return `未命名商品项目-${parts.join("")}`;
}

export function QuickStartWorkspace() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleStart = async () => {
    if (!files.length) {
      toast.error("请先上传至少 1 张主商品图。");
      return;
    }

    setSubmitting(true);

    try {
      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: buildDraftProjectName(),
          platform: "general_ecommerce",
          style: "generic_clean",
          description: "由首页快速开始自动创建",
        }),
      });
      const createdPayload = await createResponse.json();
      if (!createdPayload.success) {
        throw new Error(createdPayload.error?.message ?? "创建项目失败");
      }


      const projectId = createdPayload.data.id as string;
      for (const [index, file] of files.entries()) {
        const base64Payload = await fileToBase64Payload(file);
        const uploadResponse = await fetch(`/api/projects/${projectId}/assets/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: index === 0 ? "MAIN" : "ANGLE",
            ...base64Payload,
          }),
        });
        const uploadPayload = await uploadResponse.json();
        if (!uploadPayload.success) {
          throw new Error(uploadPayload.error?.message ?? (index === 0 ? "主商品图上传失败" : "补充商品图上传失败"));
        }
      }

      const analyzeResponse = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const analyzePayload = await analyzeResponse.json();

      if (!analyzePayload.success) {
        const rawErrorCode = String(analyzePayload.error?.code ?? "");
        const shouldAutoRetry = rawErrorCode === "PROVIDER_TIMEOUT";
        const errorCode = encodeURIComponent(rawErrorCode);
        const errorMessage = encodeURIComponent(
          String(analyzePayload.error?.message ?? "主图已上传，但自动分析未完成。"),
        );

        toast.warning(
          shouldAutoRetry
          ? "商品图已上传，正在为你跳转到分析页继续自动重试。"
          : "商品图已上传，已为你跳转到分析页继续处理。",
        );

        router.push(
          `/projects/${projectId}/analysis?source=quick-start${shouldAutoRetry ? "&autoRun=1" : ""}&analysisErrorCode=${errorCode}&analysisErrorMessage=${errorMessage}`,
        );
        return;
      }

      toast.success("商品图上传完成，AI 已自动完成首轮分析。");
      router.push(`/projects/${projectId}/analysis`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "快速开始失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-6xl flex-col space-y-8">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950 dark:text-white md:text-5xl">
          上传产品图片
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-500 dark:text-slate-400">
          上传多张产品图，AI 将综合分析商品信息
        </p>
      </div>

      <div className="flex min-h-0 flex-1 rounded-[2rem] border border-slate-200 bg-white/84 p-6 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/6 md:p-10">
        <div className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-dashed border-slate-300 bg-white/50 p-6 dark:border-white/10 dark:bg-white/[0.03] md:p-12">
          <Input
            id="quick-start-file"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
              if (!selectedFiles.length) {
                event.currentTarget.value = "";
                return;
              }
              setFiles((current) => {
                const nextFiles = [...current, ...selectedFiles];
                if (nextFiles.length > 6) {
                  toast.warning("最多上传 6 张商品图，已保留前 6 张。");
                }
                return nextFiles.slice(0, 6);
              });
              event.currentTarget.value = "";
            }}
            className="hidden"
          />

          <label
            htmlFor="quick-start-file"
            className="flex min-h-[420px] flex-1 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] transition hover:bg-slate-50/80 dark:hover:bg-white/[0.04]"
          >
            {previewUrls.length ? (
              <div className="flex flex-col items-center justify-center">
                <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-3">
                  {previewUrls.map((url, index) => (
                    <div key={url} className="group relative overflow-hidden rounded-[1.25rem] bg-slate-100 shadow-sm dark:bg-white/8">
                      <div className="aspect-square">
                        <img src={url} alt={files[index]?.name ?? ("商品图 " + (index + 1))} className="h-full w-full object-contain" />
                      </div>
                      <button
                        type="button"
                        className="absolute right-2 top-2 hidden rounded-full bg-black/65 p-1.5 text-white group-hover:block"
                        onClick={(event) => {
                          event.preventDefault();
                          setFiles((current) => current.filter((_, item) => item !== index));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[10px] text-white">
                        {index === 0 ? "主商品图" : "补充角度图"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-2 text-center">
                  {submitting ? (
                    <div className="inline-flex items-center gap-2 text-lg text-slate-400 dark:text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>正在分析产品...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">已选择产品图</p>
                      <p className="max-w-md truncate text-sm text-slate-400 dark:text-slate-500">已选择 {files.length} 张图片</p>
                      <p className="text-sm text-slate-400 dark:text-slate-500">点击图片区域可继续添加，右上角可删除</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-white/10 dark:bg-black/30 dark:text-white">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <p className="mt-6 text-lg font-medium text-slate-900 dark:text-white">点击上传产品图片</p>
                <p className="mt-2 text-sm leading-7 text-slate-400 dark:text-slate-500">
                  支持 JPG、PNG、WEBP，最多 6 张；第一张作为主商品图，其余作为补充角度图
                </p>
              </div>
            )}
          </label>

          <div className="mt-6 flex justify-center">
            <Button onClick={handleStart} disabled={submitting || !files.length} className="min-w-[220px] rounded-full px-8">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {submitting ? "正在上传并自动分析…" : "开始分析"}
            </Button>
          </div>
        </div>
      </div>

    </section>
  );
}
