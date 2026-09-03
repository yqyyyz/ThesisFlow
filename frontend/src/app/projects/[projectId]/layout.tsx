import ProjectShell from "@/components/project/ProjectShell";

export default async function ProjectLayout(
  props: LayoutProps<"/projects/[projectId]">
) {
  const { projectId } = await props.params;
  return <ProjectShell projectId={projectId}>{props.children}</ProjectShell>;
}
