// Escapes text for HTML content and attribute values.
export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
