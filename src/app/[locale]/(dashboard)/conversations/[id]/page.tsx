import { redirect } from "next/navigation";

// Individual conversation pages redirect to lead detail
export default function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  // In a full implementation this would show the conversation thread
  // For now redirect to conversations list
  redirect("/conversations");
}