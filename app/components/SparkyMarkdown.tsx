"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export default function SparkyMarkdown({ content }: { content: string }) {
  return (
    <div className="prose-sparky markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
            const { inline, children } = props as any;
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
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 underline"
            >
              {children}
            </a>
          ),
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
