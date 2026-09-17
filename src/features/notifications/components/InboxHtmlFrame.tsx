import styles from './InboxHtmlFrame.module.css'

type Props = {
  html: string
  title?: string
}

/** Sandboxed HTML report viewer for inbox details (no scripts). */
export function InboxHtmlFrame({ html, title }: Props): React.JSX.Element {
  return (
    <iframe
      className={styles.frame}
      title={title || 'report'}
      sandbox=""
      srcDoc={html}
      referrerPolicy="no-referrer"
    />
  )
}
