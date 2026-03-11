export const dynamic = "force-dynamic"
export const revalidate = 0
import prisma from "../../lib/prisma"
import CoursesTable from "./CoursesTable"
import { majorRequirements } from "@/lib/majorRequirements"

type SortKey = "difficultyDesc" | "difficultyAsc"

function parseSort(sort: string | undefined): SortKey {
  if (sort === "difficultyAsc") return "difficultyAsc"
  return "difficultyDesc"
}



export default async function CoursesPage({
  searchParams,
}: {
    searchParams: Promise<{
    sort?: string
    page?: string
    dept?: string
    q?: string
    gened?: string
    genedCategory?: string
    major?: string
    majorCategory?: string
  }>
}) {
  const sp = await searchParams

  const sort = parseSort(sp.sort)
  const page = Math.max(1, Number(sp.page || "1") || 1)
  const pageSize = 50
  const skip = (page - 1) * pageSize

  const dept = sp.dept?.trim() || ""
  const q = sp.q?.trim() || ""

  const gened = sp.gened === "1"
const genedCategory = sp.genedCategory?.trim() || ""

  const major = sp.major?.trim() || ""
  const majorCategory = sp.majorCategory?.trim() || ""

  const hasSortParam = !!sp.sort
const hasQuery = q.length > 0

const qLower = q.toLowerCase()
const qCompact = qLower.replace(/\s+/g, "")
const qParts = q.trim().split(/\s+/)

const subjectPart = qParts[0]?.match(/^[a-zA-Z]+$/) ? qParts[0] : ""
const numberPart = qParts[1]?.match(/^\d+[a-zA-Z]*$/) ? qParts[1] : ""

  const selectedMajor = majorRequirements.find((m) => m.key === major)
  const selectedMajorCategory = selectedMajor?.categories.find(
    (c) => c.key === majorCategory
  )

  const majorCoursePairs = selectedMajorCategory
    ? selectedMajorCategory.courses
        .map((courseCode) => {
          const [subject, ...rest] = courseCode.trim().split(/\s+/)
          const number = rest.join(" ")
          if (!subject || !number) return null
          return { subject, number }
        })
        .filter((value): value is { subject: string; number: string } => value !== null)
    : []

const where = {
  AND: [
    ...(dept ? [{ subject: dept }] : []),

    ...(q
      ? [
          {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { subject: { contains: q, mode: "insensitive" as const } },
              { number: { contains: q, mode: "insensitive" as const } },

              ...(subjectPart && numberPart
                ? [
                    {
                      AND: [
                        { subject: { equals: subjectPart, mode: "insensitive" as const } },
                        { number: { startsWith: numberPart, mode: "insensitive" as const } },
                      ],
                    },
                  ]
                : []),

              ...(qCompact
                ? [
                    {
                      AND: [
                        {
                          subject: {
                            contains: qCompact.replace(/\d.*$/, ""),
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          number: {
                            contains: qCompact.replace(/^[a-zA-Z]+/, ""),
                            mode: "insensitive" as const,
                          },
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),

    ...(gened ? [{ isGenEd: true }] : []),

    ...(genedCategory ? [{ genEdCategory: genedCategory }] : []),

    ...(selectedMajorCategory && majorCoursePairs.length > 0
      ? [
          {
            OR: majorCoursePairs.map(({ subject, number }) => ({
              AND: [
                { subject: { equals: subject, mode: "insensitive" as const } },
                { number: { equals: number, mode: "insensitive" as const } },
              ],
            })),
          },
        ]
      : []),

    ...(!hasQuery
      ? [
          {
            difficultyScore: { not: null },
            avgGpa: { gt: 0 },
          },
        ]
      : []),
  ],
}

  const orderBy =
    sort === "difficultyAsc"
      ? [
          { difficultyScore: "asc" as const },
          { totalRegsAllTime: "desc" as const },
          { subject: "asc" as const },
          { number: "asc" as const },
        ]
      : [
          { difficultyScore: "desc" as const },
          { totalRegsAllTime: "desc" as const },
          { subject: "asc" as const },
          { number: "asc" as const },
        ]

  const [courses, total, subjectsRows] = await Promise.all([
    prisma.course.findMany({
      where,
      take: pageSize,
      skip,
      orderBy,
      select: {
        id: true,
        subject: true,
        number: true,
        title: true,
        difficultyScore: true,
        avgGpa: true,
        totalRegsAllTime: true,
        isGenEd: true,
  genEdCategory: true,
      },
    }),
    prisma.course.count({ where }),
    prisma.course.findMany({
      distinct: ["subject"],
      select: { subject: true },
      orderBy: { subject: "asc" },
    }),
  ])

  const subjects = subjectsRows.map((s) => s.subject).filter(Boolean)

  return (
        <CoursesTable
      courses={courses}
      total={total}
      page={page}
      pageSize={pageSize}
      sort={sort}
      dept={dept}
      q={q}
      subjects={subjects}
      gened={gened}
      genedCategory={genedCategory}
      major={major}
      majorCategory={majorCategory}
    />
  )
}