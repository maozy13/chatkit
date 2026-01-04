import {
  ApplicationContext,
  ChatMessage,
  OnboardingInfo,
  WebSearchQuery,
  WebSearchResult,
  RoleType,
} from '../../types';
import { Constructor } from '../../utils/mixins';

/**
 * DIP 的 AssistantMessage 接口
 * 对应 agent-app.schemas.yaml#/components/schemas/Message
 */
interface AssistantMessage {
  message?: {
    id?: string;
    conversation_id?: string;
    role?: string;
    content?: {
      final_answer?: {
        thinking?: string;
        answer?: {
          text?: string;
        };
      };
      middle_answer?: {
        progress?: Progress[];
      };
    };
  };
  error?: string;
}

/**
 * Progress 接口
 * 智能体执行过程中的一个步骤
 */
interface Progress {
  stage?: string;
  answer?: string;
  skill_info?: {
    name?: string;
    input?: any;
    output?: any;
  };
}

/**
 * EventMessage 接口
 * DIP 的 Event Stream Message
 */
interface EventMessage {
  seq_id?: number;
  key?: Array<string | number>;
  action?: 'append' | 'upsert' | 'end';
  content?: any;
}

/**
 * DIPBase 的 props 接口
 */
export interface DIPBaseProps {
  /** AISHU DIP 的 Agent ID,用作路径参数 */
  agentId: string;

  /** 访问令牌,需要包含 Bearer 前缀 (已废弃，请使用 token 属性) */
  bearerToken?: string;

  /** 服务端基础地址,应包含 /api/agent-app/v1 前缀 */
  baseUrl?: string;

  /** agent 版本，"v0"表示最新版本，默认 "v0" */
  agentVersion?: string;

  /** 智能体执行引擎版本，最新为"v2"，默认 "v2" */
  executorVersion?: string;

  /** 智能体所属的业务域,用于 agent-factory API */
  businessDomain?: string;

  /** 调用接口时携带的令牌 */
  token?: string;

  /** 刷新 token 的方法 */
  refreshToken?: () => Promise<string>;
}

/**
 * DIPBase Mixin 函数
 * 根据 TypeScript 官方文档实现的 mixin 模式
 *
 * 该 mixin 为基础类添加 AISHU DIP API 的集成能力，包括：
 * - getOnboardingInfo(): 获取开场白信息
 * - generateConversation(): 创建新会话
 * - reduceAssistantMessage(): 从 EventStream 中提取出 action 和 content，并根据 action 将 content 增量更新到 AssistantMessage
 * - shouldRefreshToken(): 判断 API 响应的状态码是否是 401，如果是，则表示需要刷新 Token
 * - terminateConversation(): 终止会话
 *
 * @param Base 基础类，通常是 CopilotBase 或 AssistantBase
 * @returns 混入 DIP 功能后的类
 */
export function DIPBaseMixin<TBase extends Constructor>(Base: TBase) {
  return class DIPBase extends Base {
    /** 服务端基础地址 */
    public dipBaseUrl: string;

    /** Agent ID */
    public dipId: string;

    /** agent 版本 */
    public dipVersion: string;

    /** 智能体执行引擎版本 */
    public dipExecutorVersion: string;

    /** 业务域 */
    public dipBusinessDomain: string;

    /** DIP 调用接口时携带的令牌 */
    public dipToken: string;

    /** DIP 刷新 token 的方法 */
    public dipRefreshToken?: () => Promise<string>;

    constructor(...args: any[]) {
      super(...args);

      // 从 props 中提取 DIP 相关配置
      const props = args[0] as DIPBaseProps;

      this.dipBaseUrl = props.baseUrl || 'https://dip.aishu.cn/api/agent-app/v1';
      this.dipId = props.agentId;
      this.dipVersion = props.agentVersion || 'latest';
      this.dipExecutorVersion = props.executorVersion || 'v2';
      this.dipBusinessDomain = props.businessDomain || 'bd_public';
      this.dipToken = props.token || '';
      this.dipRefreshToken = props.refreshToken;

      // 向后兼容：如果传入了 bearerToken 但没有 token，从 bearerToken 中提取 token
      if (props.bearerToken && !props.token) {
        // bearerToken 包含 "Bearer " 前缀，需要移除
        this.dipToken = props.bearerToken.replace(/^Bearer\s+/i, '');
      }
    }

    /**
     * 获取开场白和预置问题
     * 调用 AISHU DIP 的 agent-factory API 获取智能体配置信息，提取开场白和预置问题
     * API 端点: GET /api/agent-factory/v3/agent-market/agent/{agent_id}/version/v0
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @returns 返回开场白信息，包含开场白文案和预置问题
     */
    public async getOnboardingInfo(): Promise<OnboardingInfo> {
      try {
        console.log('正在获取 DIP 配置...');

        // 构造 agent-factory API 的完整 URL
        let agentFactoryUrl: string;
        if (this.dipBaseUrl.startsWith('http://') || this.dipBaseUrl.startsWith('https://')) {
          // 生产环境：使用完整 URL
          const baseUrlObj = new URL(this.dipBaseUrl);
          agentFactoryUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}/api/agent-factory/v3/agent-market/agent/${encodeURIComponent(this.dipId)}/version/v0`;
        } else {
          // 开发环境：使用相对路径走代理
          agentFactoryUrl = `/api/agent-factory/v3/agent-market/agent/${encodeURIComponent(this.dipId)}/version/v0`;
        }

        console.log('调用 agent-factory API:', agentFactoryUrl);

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支持 token 刷新和重试
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(agentFactoryUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.dipToken}`,
              'Content-Type': 'application/json',
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取 DIP 配置失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });

        // 从响应中提取开场白和预置问题
        const config = result.config || {};
        const openingRemarkConfig = config.opening_remark_config || {};
        const presetQuestions = config.preset_questions || [];

        // 构造开场白信息
        let prologue = '你好！我是数据智能体助手，我可以帮你分析数据、回答问题。';
        if (openingRemarkConfig.type === 'fixed' && openingRemarkConfig.fixed_opening_remark) {
          prologue = openingRemarkConfig.fixed_opening_remark;
        }

        // 提取预置问题
        const predefinedQuestions = presetQuestions
          .map((item: any) => item.question)
          .filter((q: any) => typeof q === 'string' && q.trim().length > 0);

        const onboardingInfo: OnboardingInfo = {
          prologue,
          predefinedQuestions,
        };
        return onboardingInfo;
      } catch (error) {
        console.error('获取 DIP 配置失败:', error);
        // 返回默认开场白信息
        return {
          prologue: '你好！我是数据智能体助手，我可以帮你分析数据、回答问题。',
          predefinedQuestions: [],
        };
      }
    }

    /**
     * 创建新的会话
     * 调用 DIP API 创建新的会话，返回会话 ID
     * API 端点: POST /app/{agent_id}/conversation
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @returns 返回新创建的会话 ID
     */
    public async generateConversation(): Promise<string> {
      try {
        console.log('正在创建 DIP 会话...');

        // 构造创建会话的请求体
        const requestBody = {
          agent_id: this.dipId,
          agent_version: 'latest',
        };

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支持 token 刷新和重试
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(
            `${this.dipBaseUrl}/app/${this.dipId}/conversation`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.dipToken}`,
              },
              body: JSON.stringify(requestBody),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`创建 DIP 会话失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });

        // 从响应中获取会话 ID
        const conversationId = result.data?.id || result.id || '';

        console.log('DIP 会话创建成功, conversationID:', conversationId, 'ttl:', result.data?.ttl || result.ttl);
        return conversationId;
      } catch (error) {
        console.error('创建 DIP 会话失败:', error);
        // 返回空字符串，允许在没有会话 ID 的情况下继续
        return '';
      }
    }

    /**
     * 调用 DIP API 发送消息(流式)
     * 该方法实现了完整的消息发送逻辑,子类无需覆盖
     * @param text 用户输入
     * @param ctx 应用上下文
     * @param conversationID 发送的对话消息所属的会话 ID
     * @returns 返回助手消息
     */
    public async sendMessage(text: string, ctx: ApplicationContext, conversationID?: string): Promise<ChatMessage> {
      if (!this.dipBaseUrl) {
        throw new Error('DIP baseUrl 不能为空');
      }

      // 构造上下文信息
      let fullQuery = text;
      if (ctx && ctx.title) {
        fullQuery = `【上下文: ${ctx.title}】\n${JSON.stringify(ctx.data, null, 2)}\n\n${text}`;
      }

      // 构造请求体
      const body = {
        agent_id: this.dipId,
        agent_version: this.dipVersion,
        executor_version: this.dipExecutorVersion,
        query: fullQuery,
        stream: true,
        custom_querys: ctx?.data,
        conversation_id: conversationID || undefined,
      };

      // 使用 executeDataAgentWithTokenRefresh 包装 API 调用
      const response = await this.executeDataAgentWithTokenRefresh(async () => {
        const res = await fetch(
          `${this.dipBaseUrl}/app/${this.dipId}/chat/completion`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              Authorization: `Bearer ${this.dipToken}`,
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          const error: any = new Error(`DIP API 调用失败: ${res.status} ${errText}`);
          error.status = res.status;
          error.body = errText;
          throw error;
        }

        return res;
      });

      const assistantMessageId = `assistant-${Date.now()}`;
      const initialAssistantMessage: ChatMessage = {
        messageId: assistantMessageId,
        content: [],
        role: {
          name: 'AI 助手',
          type: RoleType.ASSISTANT,
          avatar: '',
        },
      };

      // 使用 any 类型断言来访问 setState 方法
      (this as any).setState((prevState: any) => ({
        messages: [...prevState.messages, initialAssistantMessage],
        streamingMessageId: assistantMessageId,
      }));

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取流式响应');
      }

      // 处理流式响应
      await (this as any).handleStreamResponse(reader, assistantMessageId);

      // 从 state 中获取最终更新后的消息
      const finalMessage = (this as any).state.messages.find((msg: any) => msg.messageId === assistantMessageId);

      return finalMessage || initialAssistantMessage;
    }

  /**
   * 将 API 接口返回的 EventStream 增量解析成完整的 AssistantMessage 对象
   * 根据设计文档实现白名单机制和 JSONPath 处理
   * @param eventMessage 接收到的一条 Event Message
   * @param prev 上一次增量更新后的 AssistantMessage 对象
   * @param messageId 当前正在更新的消息 ID
   * @returns 返回更新后的 AssistantMessage 对象
   */
  public reduceAssistantMessage<T = any, K = any>(eventMessage: T, prev: K, messageId: string): K {
    try {
      // 解析 EventMessage
      const parsed = typeof eventMessage === 'string' ? JSON.parse(eventMessage) : eventMessage;
      const em = this.parseEventMessage(parsed);

      // 如果 action 是 'end'，直接返回
      if (em.action === 'end') {
        console.log('EventStream 结束');
        return prev;
      }

      // 检查是否在白名单中
      const jsonPath = this.keyToJSONPath(em.key || []);
      const whitelistEntry = this.getWhitelistEntry(em.action || '', jsonPath);

      if (!whitelistEntry) {
        // 不在白名单中，跳过
        console.log('跳过非白名单事件:', em.action, jsonPath);
        return prev;
      }

      // 克隆 prev 对象以避免直接修改
      let assistantMessage: AssistantMessage = JSON.parse(JSON.stringify(prev || {}));

      // 根据 action 处理 content
      if (em.action === 'upsert') {
        assistantMessage = this.applyUpsert(assistantMessage, em.key || [], em.content);
      } else if (em.action === 'append') {
        assistantMessage = this.applyAppend(assistantMessage, em.key || [], em.content);
      }

      // 执行后处理，传入 messageId
      if (whitelistEntry.postProcess) {
        whitelistEntry.postProcess(assistantMessage, em.content, messageId);
      }

      return assistantMessage as K;
    } catch (e) {
      console.error('解析 DIP 事件失败:', e, eventMessage);
      return prev;
    }
  }

  /**
   * 解析原始事件为 EventMessage
   */
  public parseEventMessage(raw: any): EventMessage {
    // 从 SSE data 中提取
    if (raw.data) {
      const dataStr = typeof raw.data === 'string' ? raw.data : JSON.stringify(raw.data);
      try {
        const parsed = JSON.parse(dataStr);
        return {
          seq_id: parsed.seq_id || parsed.seq,
          key: parsed.key,
          action: parsed.action,
          content: parsed.content,
        };
      } catch {
        return raw;
      }
    }

    return {
      seq_id: raw.seq_id || raw.seq,
      key: raw.key,
      action: raw.action,
      content: raw.content,
    };
  }

  /**
   * 将 key 数组转换为 JSONPath 字符串
   * 例如: ["message", "content", "final_answer", "answer", "text"]
   * => "message.content.final_answer.answer.text"
   */
  public keyToJSONPath(key: Array<string | number>): string {
    return key.map((k, index) => {
      if (typeof k === 'number') {
        return `[${k}]`;
      }
      return index === 0 ? k : `.${k}`;
    }).join('').replace(/\.\[/g, '[');
  }

  /**
   * 白名单定义
   * 根据设计文档 3.2 Event Message 白名单
   *
   * 注意：postProcess 方法需要调用 appendMarkdownBlock 和 appendWebSearchBlock
   * 这些方法需要在子类中实现
   */
  public getWhitelistEntry(action: string, jsonPath: string): {
    postProcess?: (assistantMessage: AssistantMessage, content: any, messageId: string) => void;
  } | null {
    const entries: {
      [key: string]: {
        postProcess?: (assistantMessage: AssistantMessage, content: any, messageId: string) => void
      }
    } = {
      'upsert:error': {},
      'upsert:message': {},
      'append:message.content.final_answer.answer.text': {
        postProcess: (assistantMessage, _content, messageId) => {
          // 从 AssistantMessage 中提取完整的文本内容
          const text = assistantMessage.message?.content?.final_answer?.answer?.text || '';
          // 调用 appendMarkdownBlock 方法更新界面上的 Markdown 块
          (this as any).appendMarkdownBlock(messageId, text);
        },
      },
      'append:message.content.middle_answer.progress': {
        postProcess: (_assistantMessage, content, messageId) => {
          // content 是一个 Progress 对象
          if (content?.stage === 'skill') {
            // 检查是否是 Web 搜索工具
            if (content.skill_info?.name === 'zhipu_search_tool') {
              // 构造 WebSearchQuery 并调用渲染方法
              const searchQuery = this.extractWebSearchQuery(content);
              if (searchQuery) {
                (this as any).appendWebSearchBlock(messageId, searchQuery);
              }
            }
          } else if (content?.stage === 'llm') {
            // LLM 阶段，输出 answer
            const answer = content.answer || '';
            (this as any).appendMarkdownBlock(messageId, answer);
          }
        },
      },
    };

    // 对于数组索引的情况，使用正则匹配
    const progressArrayPattern = /^message\.content\.middle_answer\.progress\[\d+\]$/;
    const progressArrayAnswerPattern = /^message\.content\.middle_answer\.progress\[\d+\]\.answer$/;

    if (action === 'append' && progressArrayPattern.test(jsonPath)) {
      return entries['append:message.content.middle_answer.progress'];
    }

    if (action === 'append' && progressArrayAnswerPattern.test(jsonPath)) {
      return {
        postProcess: (assistantMessage, _content, messageId) => {
          // 提取最后一个 progress 的 answer
          const progress = assistantMessage.message?.content?.middle_answer?.progress || [];
          if (progress.length > 0) {
            const lastProgress = progress[progress.length - 1];
            const answer = lastProgress.answer || '';
            (this as any).appendMarkdownBlock(messageId, answer);
          }
        },
      };
    }

    const key = `${action}:${jsonPath}`;
    return entries[key] || null;
  }

  /**
   * 从 Progress 对象中提取 Web 搜索查询
   * 根据 OpenAPI 规范，搜索数据在 answer.choices[0].message.tool_calls 中
   * tool_calls[0] 是 SearchIntent（输入），tool_calls[1] 是 SearchResult（输出）
   */
  public extractWebSearchQuery(progress: any): WebSearchQuery | null {
    try {
      // 从 answer.choices[0].message.tool_calls 中提取数据
      const toolCalls = progress?.answer?.choices?.[0]?.message?.tool_calls;

      if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length < 2) {
        return null;
      }

      // tool_calls[0] 是 SearchIntent（输入）
      const searchIntentObj = toolCalls[0];

      // search_intent 是一个数组，取第一个元素
      const searchIntentArray = searchIntentObj?.search_intent;
      const searchIntent = Array.isArray(searchIntentArray) ? searchIntentArray[0] : searchIntentArray;

      const query = searchIntent?.query || searchIntent?.keywords || '';

      // tool_calls[1] 是 SearchResult（输出）
      const searchResultObj = toolCalls[1];

      const searchResultArray = searchResultObj?.search_result;

      if (!searchResultArray || !Array.isArray(searchResultArray)) {
        return null;
      }

      const results: WebSearchResult[] = searchResultArray.map((item: any) => ({
        content: item.content || '',
        icon: item.icon || '',
        link: item.link || '',
        media: item.media || '',
        title: item.title || '',
      }));

      return {
        input: query,
        results,
      };
    } catch (e) {
      console.error('提取 Web 搜索查询失败:', e);
      return null;
    }
  }

  /**
   * 执行 upsert 操作
   * 将 content 赋值到 JSONPath 指定的位置
   */
  public applyUpsert(obj: AssistantMessage, key: Array<string | number>, content: any): AssistantMessage {
    if (key.length === 0) return obj;

    // 使用递归方式设置嵌套属性
    const cloned = { ...obj };
    this.setNestedProperty(cloned, key, content);
    return cloned;
  }

  /**
   * 执行 append 操作
   * 如果 JSONPath 是数组下标，在该位置插入新对象
   * 否则在文本后追加内容
   */
  public applyAppend(obj: AssistantMessage, key: Array<string | number>, content: any): AssistantMessage {
    if (key.length === 0) return obj;

    const cloned = { ...obj };
    const lastKey = key[key.length - 1];

    if (typeof lastKey === 'number') {
      // 数组追加：在指定索引位置插入
      const parentKey = key.slice(0, -1);
      const parent = this.getNestedProperty(cloned, parentKey) as any[];

      if (Array.isArray(parent)) {
        parent[lastKey] = content;
      }
    } else {
      // 文本追加：在现有内容后追加
      const currentValue = this.getNestedProperty(cloned, key);

      if (typeof currentValue === 'string' && typeof content === 'string') {
        this.setNestedProperty(cloned, key, currentValue + content);
      } else {
        this.setNestedProperty(cloned, key, content);
      }
    }

    return cloned;
  }

  /**
   * 获取嵌套属性
   */
  public getNestedProperty(obj: any, key: Array<string | number>): any {
    let current = obj;
    for (const k of key) {
      if (current == null) return undefined;
      current = current[k];
    }
    return current;
  }

  /**
   * 设置嵌套属性
   */
  public setNestedProperty(obj: any, key: Array<string | number>, value: any): void {
    if (key.length === 0) return;

    let current = obj;
    for (let i = 0; i < key.length - 1; i++) {
      const k = key[i];
      const nextKey = key[i + 1];

      if (current[k] == null) {
        // 根据下一个 key 的类型决定创建对象还是数组
        current[k] = typeof nextKey === 'number' ? [] : {};
      }
      current = current[k];
    }

    const lastKey = key[key.length - 1];
    current[lastKey] = value;
  }

  /**
   * 检查是否需要刷新 token
   * AISHU DIP 平台返回 401 状态码时表示 token 失效
   * @param status HTTP 状态码
   * @param error 错误响应体
   * @returns 返回是否需要刷新 token
   */
  public shouldRefreshToken(status: number, _error: any): boolean {
    // 401 Unauthorized 表示 token 失效
    return status === 401;
  }

    /**
     * 终止会话
     * 调用 DIP 的 /app/{agent_id}/chat/termination 接口终止指定会话
     * @param conversationId 要终止的会话 ID
     * @returns 返回 Promise，成功时 resolve，失败时 reject
     */
    public async terminateConversation(conversationId: string): Promise<void> {
      const url = `${this.dipBaseUrl}/app/${this.dipId}/chat/termination`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // 添加 Authorization header
      if (this.dipToken) {
        headers['Authorization'] = this.dipToken.startsWith('Bearer ') ? this.dipToken : `Bearer ${this.dipToken}`;
      }

      const body = JSON.stringify({
        conversation_id: conversationId,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`终止会话失败: ${response.status} ${errorText}`);
      }
    }

    /**
     * 执行 API 调用，并在需要时自动刷新 token 并重试一次
     * @param apiCall API 调用函数
     * @returns API 调用结果
     */
    public async executeDataAgentWithTokenRefresh<T>(
      apiCall: () => Promise<T>
    ): Promise<T> {
      try {
        // 第一次尝试
        return await apiCall();
      } catch (error: any) {
        const status = error.status || error.response?.status || 0;
        const errorBody = error.body || error.response?.data || error;

        // 检查是否需要刷新 token
        const needsRefresh = this.shouldRefreshToken(status, errorBody);

        if (needsRefresh && this.dipRefreshToken) {
          console.log('检测到 DIP token 失效，正在刷新 token...');

          try {
            // 调用 refreshToken 方法获取新 token
            const newToken = await this.dipRefreshToken();

            // 更新 token 属性
            this.dipToken = newToken;

            console.log('DIP Token 刷新成功，正在重试请求...');

            // 重试 API 调用
            try {
              return await apiCall();
            } catch (retryError: any) {
              // 重试后仍然失败，检查是否还是 token 问题
              const retryStatus = retryError.status || retryError.response?.status || 0;
              const retryErrorBody = retryError.body || retryError.response?.data || retryError;

              if (this.shouldRefreshToken(retryStatus, retryErrorBody)) {
                console.error('重试后仍然提示 token 失效，放弃重试');
              }

              // 抛出重试后的错误
              throw retryError;
            }
          } catch (refreshError) {
            console.error('刷新 DIP token 失败:', refreshError);
            // 刷新失败，抛出原始错误
            throw error;
          }
        }

        // 不需要刷新 token，直接抛出错误
        throw error;
      }
    }
  };
}
