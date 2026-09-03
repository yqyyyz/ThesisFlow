import { redirect } from "next/navigation";

export default async function ProjectIndexPage(
  props: PageProps<"/projects/[projectId]">
) {
  const { projectId } = await props.params;
  redirect(`/projects/${projectId}/documents`);
}
