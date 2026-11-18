import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Render content-manager text (Markdown). Raw HTML is ignored and unsafe link protocols are stripped
 * by react-markdown, so editors can't inject scripts. External links open in a new tab.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children.trim()) return null;
  return (
    <div className={cn("prose-site", className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          a: ({ href, children }) => {
            const external = !!href && /^https?:\/\//i.test(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {children}
              </a>
            );
          },
          // Inline images only from our own file store.
          img: ({ src, alt }) =>
            typeof src === "string" && src.startsWith("/api/files/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt ?? ""} loading="lazy" />
            ) : null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
