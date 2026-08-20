import Link from "next/link";
import { BookOpenText, FolderKanban, GalleryVerticalEnd, History, Images, ScanSearch, Settings2, Wand2 } from "lucide-react";

import { ApiUsageIndicator } from "@/components/layout/api-usage-indicator";
import { FloatingThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const appName = "MxPage";

const navItems = [
  { href: "/", label: "快速开始", icon: FolderKanban },
  { href: "/batch-create", label: "批量创建", icon: Images },
  { href: "/product-analyze", label: "商品分析", icon: ScanSearch },
  { href: "/hero-batch", label: "批量主图", icon: Wand2 },
  { href: "/history", label: "历史记录", icon: History },
  { href: "/xiaohongshu/plan", label: "小红书图文", icon: BookOpenText },
  { href: "/projects/new", label: "高级创建", icon: GalleryVerticalEnd },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <div className="fixed bottom-4 left-4 z-[60]">
        <FloatingThemeToggle />
      </div>
      <div className="mx-auto min-h-screen max-w-[1600px] px-4 py-5 md:px-6">
        <aside
          className="scrollbar-hidden fixed top-5 z-40 hidden h-[calc(100vh-2.5rem)] w-72 overflow-y-auto rounded-[2rem] border border-white/70 bg-white/76 p-5 shadow-soft backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b0b0c]/88 dark:shadow-[0_24px_60px_-38px_rgba(0,0,0,0.72)] md:flex md:flex-col"
          style={{ left: "max(1.5rem, calc((100vw - 1600px) / 2 + 1.5rem))" }}
        >
          <Link
            href="/"
            className="flex items-center gap-3 rounded-2xl border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(245,245,245,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-white">
              <img src="/brand-icon.ico" alt={appName} className="h-full w-full object-cover" suppressHydrationWarning />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{appName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">AI 商品图文工作台</p>
            </div>
          </Link>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all duration-200",
                    "text-slate-600 hover:bg-white/85 hover:text-slate-950 hover:shadow-sm",
                    "dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-[2rem] border border-white/80 bg-white/68 p-5 text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#141416]/88 dark:text-slate-300">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">出品方</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">灵矩绘境 · MxPage</p>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">
                      V2
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-xs leading-6 text-slate-500 dark:text-slate-400">
                MxPage 由灵矩绘境出品，面向真实商品图文与详情页工作流，支持商品分析、页面规划、图像生成、局部编辑、导出以及 OpenAI 兼容模型接入。
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 rounded-[2rem] border border-white/80 bg-white/74 p-5 shadow-soft backdrop-blur-2xl dark:border-white/10 dark:bg-[#0f0f10]/82 dark:shadow-[0_24px_60px_-38px_rgba(0,0,0,0.78)] md:ml-[19.5rem] md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/monitor/usage"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-10 gap-2 rounded-2xl border-slate-200 bg-white px-3 shadow-sm hover:bg-white dark:border-white/10 dark:bg-black/30 dark:hover:border-white/20 dark:hover:bg-white/8",
              )}
            >
              <span className="text-sm font-medium">API 监控</span>
              <ApiUsageIndicator />
            </Link>
            <Link href="/settings/providers" className={cn(buttonVariants({ variant: "default" }))}>
              <Settings2 className="mr-2 h-4 w-4" />
              AI 配置
            </Link>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
