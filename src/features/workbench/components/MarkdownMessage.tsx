import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './MarkdownMessage.module.css'

interface MarkdownMessageProps {
  content: string
  streaming?: boolean
  className?: string
}

export function MarkdownMessage({
  content,
  streaming = false,
  className,
}: MarkdownMessageProps): React.JSX.Element {
  const text = content.trimEnd()
  return (
    <div className={`${styles.root} ${streaming ? styles.streaming : ''} ${className ?? ''}`.trim()}>
      {text ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
            pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
            code: ({ className: codeClass, children, ...props }) => {
              const isBlock = Boolean(codeClass) || String(children).includes('\n')
              if (isBlock) {
                return (
                  <code className={`${styles.codeBlock} ${codeClass ?? ''}`.trim()} {...props}>
                    {children}
                  </code>
                )
              }
              return (
                <code className={styles.codeInline} {...props}>
                  {children}
                </code>
              )
            },
            table: ({ children }) => (
              <div className={styles.tableWrap}>
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      ) : null}
      {streaming ? <span className={styles.caret} aria-hidden /> : null}
    </div>
  )
}
