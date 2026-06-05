/**
 * StreamingText — partial markdown text + animated streaming cursor.
 * Sits inside a `.ctext` flow; inherits its text colour and typography.
 */
import { MarkdownRenderer } from './MarkdownRenderer'

interface Props {
  text: string
}

export function StreamingText({ text }: Props) {
  return (
    <>
      <MarkdownRenderer content={text} />
      <span className="streaming-cursor" />
    </>
  )
}
