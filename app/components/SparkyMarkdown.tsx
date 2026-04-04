"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  buildSparkyEntityLookup,
  findSparkyTextMatches,
  type SparkyEntityLookup,
  type SparkyLinkEntityPayload,
} from "@/lib/chat/entity-linking";

let sparkyLinkLookupPromise: Promise<SparkyEntityLookup> | null = null;

type MarkdownNode = {
  type?: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

type MarkdownCodeProps = ComponentProps<"code"> & {
  inline?: boolean;
};

async function loadSparkyLinkLookup() {
  sparkyLinkLookupPromise ??= fetch("/api/chat/link-entities")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Sparky link entities (${response.status})`);
      }
      return response.json() as Promise<SparkyLinkEntityPayload>;
    })
    .then((payload) => buildSparkyEntityLookup(payload));

  return sparkyLinkLookupPromise;
}

function remarkSparkyEntityLinks(lookup: SparkyEntityLookup) {
  return function transform(tree: MarkdownNode) {
    const visit = (node: MarkdownNode) => {
      if (!node || !Array.isArray(node.children)) return;

      const nextChildren: MarkdownNode[] = [];
      for (const child of node.children) {
        if (child?.type === "text") {
          const matches = findSparkyTextMatches(String(child.value ?? ""), lookup);

          if (!matches.length) {
            nextChildren.push(child);
            continue;
          }

          let cursor = 0;
          for (const match of matches) {
            if (match.start > cursor) {
              nextChildren.push({
                type: "text",
                value: child.value.slice(cursor, match.start),
              });
            }

            nextChildren.push({
              type: "link",
              url: match.href,
              children: [{ type: "text", value: match.label }],
            });

            cursor = match.end;
          }

          if (cursor < child.value.length) {
            nextChildren.push({
              type: "text",
              value: child.value.slice(cursor),
            });
          }

          continue;
        }

        if (!["link", "linkReference", "code", "inlineCode", "html"].includes(child?.type)) {
          visit(child);
        }

        nextChildren.push(child);
      }

      node.children = nextChildren;
    };

    visit(tree);
  };
}

export default function SparkyMarkdown({ content }: { content: string }) {
  const [linkLookup, setLinkLookup] = useState<SparkyEntityLookup | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadSparkyLinkLookup()
      .then((lookup) => {
        if (!cancelled) setLinkLookup(lookup);
      })
      .catch((error) => {
        console.error("Failed to load Sparky link lookup", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="prose-sparky markdown-body">
      <ReactMarkdown
        remarkPlugins={linkLookup ? [remarkGfm, remarkSparkyEntityLinks(linkLookup)] : [remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-zinc-900 dark:text-white font-bold text-xl mt-6 mb-3">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-zinc-900 dark:text-white font-bold text-[17px] mt-5 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-zinc-900 dark:text-white font-bold text-base mt-4 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mt-3 first:mt-0 text-zinc-700 dark:text-zinc-300 leading-[1.75]">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="text-zinc-900 dark:text-white font-semibold">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="my-2 space-y-1.5 list-disc pl-5 text-zinc-700 dark:text-zinc-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1.5 list-decimal pl-5 text-zinc-700 dark:text-zinc-300">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-[1.7]">{children}</li>
          ),
          code(props) {
            const { inline, children } = props as MarkdownCodeProps;
            if (inline) {
              return (
                <code className="bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-[13px] font-mono">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 overflow-x-auto my-3">
                <code className="text-zinc-800 dark:text-zinc-200 font-mono text-[13px]">
                  {children}
                </code>
              </pre>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-zinc-200 dark:border-zinc-800">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 align-top">{children}</td>
          ),
          a: ({ href, children }) => {
            const isInternal = typeof href === "string" && href.startsWith("/");

            return (
              <a
                href={href}
                target={isInternal ? undefined : "_blank"}
                rel={isInternal ? undefined : "noreferrer"}
                className="font-medium text-red-500 underline decoration-red-300 underline-offset-2 hover:text-red-600 dark:text-red-400 dark:decoration-red-500/60 dark:hover:text-red-300"
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 my-3 text-zinc-500 dark:text-zinc-400 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-zinc-200 dark:border-zinc-800" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
