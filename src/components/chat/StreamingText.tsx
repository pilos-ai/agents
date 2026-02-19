import { MarkdownRenderer } from './MarkdownRenderer'

interface Props {
  text: string
}

export function StreamingText({ text }: Props) {
  return (
    <div className="markdown-content text-sm">
      <MarkdownRenderer content={text} />
      <span className="streaming-cursor" />
    </div>
  )
}
