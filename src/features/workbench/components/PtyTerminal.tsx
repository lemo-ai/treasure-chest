import { useEffect, useRef, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import styles from './PtyTerminal.module.css'

export function PtyTerminal(): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null)
  const ptyIdRef = useRef<string | null>(null)
  const disposeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0f1419',
        foreground: '#d6dde6',
        cursor: '#6ee7a8',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const onResize = (): void => {
      fit.fit()
      const ptyId = ptyIdRef.current
      if (ptyId) void window.treasureChest.harnessPtyResize(ptyId, term.cols, term.rows)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(host)

    void (async () => {
      fit.fit()
      const info = await window.treasureChest.harnessPtyCreate(term.cols, term.rows, (ev) => {
        if (ev.ptyId !== ptyIdRef.current) return
        if (ev.type === 'data') term.write(ev.data)
        if (ev.type === 'exit') term.writeln(`\r\n\x1b[90m[exit ${ev.exitCode}]\x1b[0m`)
      })
      ptyIdRef.current = info.id
      term.onData((data) => {
        if (ptyIdRef.current) void window.treasureChest.harnessPtyWrite(ptyIdRef.current, data)
      })
    })().catch(() => {
      term.writeln('\x1b[31mFailed to start PTY session.\x1b[0m')
    })

    disposeRef.current = () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      const ptyId = ptyIdRef.current
      if (ptyId) void window.treasureChest.harnessPtyKill(ptyId)
      ptyIdRef.current = null
      term.dispose()
    }

    window.addEventListener('resize', onResize)

    return () => {
      disposeRef.current?.()
      disposeRef.current = null
    }
  }, [])

  return <div ref={hostRef} className={styles.host} />
}
