import { ChatKitBase, ChatKitBaseProps } from '../ChatKitBase';
import MessageList from './MessageList';
import InputArea from './InputArea';
import Header from './Header';
import Prologue from './Prologue';

/**
 * AssistantBase 基础组件
 * 作为主交互入口，是应用的主体
 *
 * 该类继承自 ChatKitBase，实现了 Assistant 模式的交互界面和交互逻辑
 * 区别于 CopilotBase，AssistantBase 在 render() 函数中渲染 Assistant 模式的界面
 */
export abstract class AssistantBase<P extends ChatKitBaseProps = ChatKitBaseProps> extends ChatKitBase<P> {
  /**
   * 实现 React.Component.render() 方法
   * 渲染 Assistant 模式的界面
   */
  render() {
    if (!this.props.visible) {
      return null;
    }

    const { title = 'Assistant', onClose } = this.props;
    const { messages, textInput, applicationContext, isSending, onboardingInfo, isLoadingOnboarding, streamingMessageId } = this.state;
    const showPrologue = messages.length === 0;
    const isStreaming = streamingMessageId !== null;

    return (
      <div className="flex flex-col h-full w-full bg-white shadow-2xl">
        {/* 头部 */}
        <Header
          title={title}
          onClose={onClose}
          onNewChat={this.createConversation}
        />

        {/* 消息列表区域或欢迎界面 */}
        <div className="flex-1 overflow-y-auto">
          {showPrologue ? (
            isLoadingOnboarding ? (
              // 加载中，显示加载提示
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                  <p className="text-sm text-gray-500">正在加载...</p>
                </div>
              </div>
            ) : (
              // 加载完成，显示开场白
              <Prologue
                onQuestionClick={this.handleQuestionClick}
                prologue={onboardingInfo?.prologue}
                predefinedQuestions={onboardingInfo?.predefinedQuestions}
              />
            )
          ) : (
            <MessageList messages={messages} />
          )}
        </div>

        {/* 输入区域 */}
        <InputArea
          value={textInput}
          onChange={this.setTextInput}
          onSend={this.handleSend}
          context={applicationContext}
          onRemoveContext={this.removeApplicationContext}
          disabled={isSending}
          isStreaming={isStreaming}
          onStop={this.handleStop}
        />
      </div>
    );
  }
}

export default AssistantBase;
