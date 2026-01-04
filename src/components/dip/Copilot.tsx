import { CopilotBase } from '../base/copilot/CopilotBase';
import { DIPBaseMixin, DIPBaseProps } from './DIPBase';
import { ChatKitBaseProps } from '../base/ChatKitBase';

/**
 * Copilot 组件的属性接口
 * 合并 ChatKitBaseProps 和 DIPBaseProps
 */
export interface CopilotProps extends ChatKitBaseProps, DIPBaseProps {}

/**
 * Copilot 组件
 * 右侧跟随的 AI 助手，适配 AISHU DIP 平台
 *
 * 使用 TypeScript mixin 模式实现多重继承：
 * - 继承 CopilotBase 的交互逻辑和界面
 * - 通过 DIPBaseMixin 混入 DIP 的 API 实现
 *
 * 注意：sendMessage 方法已在 DIPBaseMixin 中实现，无需在此覆盖
 */
// @ts-ignore - TypeScript 对抽象类和 mixin 的类型检查限制
export class Copilot extends DIPBaseMixin(CopilotBase as any) {
  // 所有方法都已在 DIPBaseMixin 中实现
  // 如果需要自定义行为，可以在此覆盖相应方法
}

export default Copilot;
