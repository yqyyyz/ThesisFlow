import WritingWorkspace from "@/components/writing/WritingWorkspace";

export default async function WritingPage(props: PageProps<"/projects/[projectId]/writing">) {
  const { projectId } = await props.params;
  return <WritingWorkspace projectId={projectId} />;
}
