import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { CourseGrid } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("COURSES");

export default async function CoursesPage() {
  const { page, data } = await loadSystemPage("COURSES");
  return (
    <PageView
      page={page}
      data={data}
      title="Courses"
      subtitle="Hands-on chip-level repair courses with placement support."
    >
      {data.courses.length ? (
        <CourseGrid courses={data.courses} />
      ) : (
        <p className="py-16 text-center text-muted-foreground">
          New batches are being planned. Enquire to be told first.
        </p>
      )}
    </PageView>
  );
}
