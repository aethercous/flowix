export interface AgentPermissions {
  can_read_navigate: boolean;
  can_send_edit: boolean;
}

export function normalizePermissions(input: {
  can_read_navigate?: boolean;
  can_send_edit?: boolean;
} | null | undefined): AgentPermissions {
  const can_read_navigate = input?.can_read_navigate !== false;
  let can_send_edit = !!input?.can_send_edit;
  if (can_send_edit && !can_read_navigate) can_send_edit = false;
  return { can_read_navigate, can_send_edit };
}

export function permissionsPromptBlock(perms: AgentPermissions): string {
  if (!perms.can_read_navigate && !perms.can_send_edit) {
    return "\n\nWeb access: disabled. Do not browse websites or interact with chats on the web.";
  }
  if (perms.can_read_navigate && !perms.can_send_edit) {
    return "\n\nPermissions: READ-ONLY. You may open allowed sites, scroll, read group chats, and take screenshots. You must NOT post messages, click submit/send buttons, fill forms to submit, edit posts, or change any content.";
  }
  return "\n\nPermissions: READ and WRITE. You may read and navigate allowed sites, and you may post messages, click buttons, type into forms, and edit content when the user asks.";
}

/** Browser actions that mutate state on a page */
export const WRITE_BROWSER_ACTIONS = new Set([
  "click_element",
  "type_text",
]);

export const READ_BROWSER_ACTIONS = new Set([
  "browse_url",
  "take_screenshot",
  "get_page_content",
  "scroll",
  "go_back",
  "go_forward",
]);
