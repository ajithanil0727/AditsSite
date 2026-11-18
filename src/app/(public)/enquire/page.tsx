import type { Metadata } from "next";
import { Suspense } from "react";
import { CourseEnquiryForm } from "@/components/site/public-forms";
import { PageTitle } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { getSiteChrome, getSiteCollections } from "@/modules/website/site.data";

export const metadata: Metadata = {
  title: "Enquire about a course",
  description: "Tell us which course interests you and a counsellor will call you back.",
  alternates: { canonical: "/enquire" },
};

export default function EnquirePage(props: PageProps<"/enquire">) {
  return (
    <>
      <PageTitle
        title="Enquire about a course"
        subtitle="Leave your number and a counsellor from your nearest branch will call you."
      />
      <section className="py-12 sm:py-16">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <Suspense fallback={<EnquiryForm courseSlug={null} />}>
              <WithCourse searchParams={props.searchParams} />
            </Suspense>
          </div>
        </Container>
      </section>
    </>
  );
}

/** ?course=<slug> pre-selects the course (links from course pages). */
async function WithCourse({ searchParams }: { searchParams: PageProps<"/enquire">["searchParams"] }) {
  const course = (await searchParams).course;
  return <EnquiryForm courseSlug={typeof course === "string" ? course : null} />;
}

async function EnquiryForm({ courseSlug }: { courseSlug: string | null }) {
  const [chrome, data] = await Promise.all([getSiteChrome(), getSiteCollections()]);
  const courses = data?.courses ?? [];
  return (
    <CourseEnquiryForm
      key={courseSlug ?? "none"}
      branches={(chrome?.branches ?? []).filter((b) => b.kind === "INSTITUTE" || b.kind === "BOTH")}
      courses={courses.map((c) => ({ value: c.id, label: c.name }))}
      defaultCourseId={courses.find((c) => c.slug === courseSlug)?.id ?? null}
    />
  );
}
