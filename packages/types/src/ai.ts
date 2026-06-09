export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskQueryRequest {
  messages: ChatMessage[];
}

export interface ToolCallTrace {
  name: string;
  input: unknown;
  result_summary: string;
}

export interface AskQueryResponse {
  answer: string;
  tool_calls: ToolCallTrace[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}
