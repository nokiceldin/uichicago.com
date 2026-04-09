export const dynamic = "force-dynamic"
export const revalidate = 0
import prisma from "@/lib/prisma"
import CoursesTable from "./CoursesTable"
import { majorRequirements } from "@/lib/majorRequirements"
import { getCurrentStudyUser } from "@/lib/auth/session"

type SortKey = "difficultyDesc" | "difficultyAsc"

function parseSort(sort: string | undefined): SortKey {
  if (sort === "difficultyAsc") return "difficultyAsc"
  return "difficultyDesc"
}

function isCodeLikeQuery(query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  if (/[a-z&]+\s*\d/.test(normalized)) return true
  return /\d/.test(normalized)
}

function getSearchableDescription(description: string) {
  const trimmed = description.trim()
  if (!trimmed) return ""

  const cutMarkers = [
    "course information:",
    "class schedule information:",
    "prerequisite",
    "recommended background:",
  ]

  const lower = trimmed.toLowerCase()
  const cutIndex = cutMarkers
    .map((marker) => lower.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  return cutIndex == null ? trimmed : trimmed.slice(0, cutIndex).trim()
}

type RankedCourseRow = {
  id: string
  subject: string
  number: string
  title: string | null
  difficultyScore: number | null
  avgGpa: number | null
  totalRegsAllTime: number | null
  isGenEd: boolean
  genEdCategory: string | null
  metaV2: { description: string | null } | null
}

function scoreCourseMatch(course: RankedCourseRow, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return 1

  const allowDescriptionMatch = !isCodeLikeQuery(query)
  const compact = q.replace(/\s+/g, "")
  const compactLetters = compact.replace(/[^a-z&]/g, "")
  const compactNumbers = compact.replace(/[^0-9a-z]/g, "").replace(/^[a-z&]+/, "")
  const title = (course.title || "").toLowerCase()
  const description = getSearchableDescription(course.metaV2?.description || "").toLowerCase()
  const subject = course.subject.toLowerCase()
  const number = course.number.toLowerCase()
  const code = `${subject} ${number}`
  const codeCompact = `${subject}${number}`.replace(/\s+/g, "")
  const titleCompact = title.replace(/\s+/g, "")
  const descriptionCompact = description.replace(/\s+/g, "")
  const words = q.split(/\s+/).filter(Boolean)
  const titleHasAllWords = words.length > 0 && words.every((word) => title.includes(word))
  const descriptionHasAllWords = words.length > 0 && words.every((word) => description.includes(word))

  if (code === q || codeCompact === compact) return 1000
  if (subject === compactLetters && compactNumbers && number.startsWith(compactNumbers)) return 950
  if (code.startsWith(q) || codeCompact.startsWith(compact)) return 900
  if (title === q || titleCompact === compact) return 890
  if (title.startsWith(q) || titleCompact.startsWith(compact)) return 860
  if (titleHasAllWords) return 820
  if (subject.startsWith(q) || number.startsWith(q)) return 700
  if (compactLetters && subject.includes(compactLetters) && compactNumbers && number.includes(compactNumbers)) return 650
  if (title.includes(q) || titleCompact.includes(compact)) return 600
  if (allowDescriptionMatch && descriptionHasAllWords) return 520
  if (allowDescriptionMatch && (description.includes(q) || descriptionCompact.includes(compact))) return 460
  if (subject.includes(q) || number.includes(q)) return 350
  return 0
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
    saved?: string
  }>
}) {
  const sp = await searchParams

  const sort = parseSort(sp.sort)
  const page = Math.max(1, Number(sp.page || "1") || 1)
  const pageSize = 50
  const skip = (page - 1) * pageSize

  const dept = sp.dept?.trim() || ""
  const q = sp.q?.trim() || ""
  const allowDescriptionMatch = !isCodeLikeQuery(q)

  const gened = sp.gened === "1"
const genedCategory = sp.genedCategory?.trim() || ""

  const major = sp.major?.trim() || ""
  const majorCategory = sp.majorCategory?.trim() || ""
  const savedOnly = sp.saved === "1"
  const studyUser = savedOnly ? await getCurrentStudyUser() : null

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
              ...(allowDescriptionMatch
                ? [{ metaV2: { description: { contains: q, mode: "insensitive" as const } } }]
                : []),
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

    ...(savedOnly
      ? [
          {
            savedByUsers: {
              some: {
                userId: studyUser?.id ?? "__no_saved_courses__",
              },
            },
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

  const [total, subjectsRows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      distinct: ["subject"],
      select: { subject: true },
      orderBy: { subject: "asc" },
    }),
  ])

  const courses = q
    ? (
        await prisma.course.findMany({
          where,
          take: Math.max(pageSize * 12, 120),
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
            metaV2: {
              select: {
                description: true,
              },
            },
          },
        })
      )
        .map((course) => ({
          course,
          score: scoreCourseMatch(course, q),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) =>
          b.score - a.score ||
          (b.course.totalRegsAllTime ?? 0) - (a.course.totalRegsAllTime ?? 0) ||
          (b.course.avgGpa ?? -1) - (a.course.avgGpa ?? -1) ||
          a.course.subject.localeCompare(b.course.subject) ||
          a.course.number.localeCompare(b.course.number) ||
          (a.course.title || "").localeCompare(b.course.title || "")
        )
        .slice(skip, skip + pageSize)
        .map(({ course }) => ({
          id: course.id,
          subject: course.subject,
          number: course.number,
          title: course.title,
          difficultyScore: course.difficultyScore,
          avgGpa: course.avgGpa,
          totalRegsAllTime: course.totalRegsAllTime,
          isGenEd: course.isGenEd,
          genEdCategory: course.genEdCategory,
        }))
    : await prisma.course.findMany({
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
      })

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
      savedOnly={savedOnly}
    />
  )
}
