import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownBlock as MarkdownBlockType } from '../../../../types';

/**
 * MarkdownBlock 组件的属性接口
 */
export interface MarkdownBlockProps {
  /** Markdown 块数据 */
  block: MarkdownBlockType;
}

/**
 * MarkdownBlock 组件
 * 用于渲染 Markdown 类型的消息块
 */
const MarkdownBlock: React.FC<MarkdownBlockProps> = ({ block }) => {
  return (
    <div className="markdown-block prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {block.content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownBlock;
