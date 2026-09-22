type TimelineCourse = {
  slotId: string;
  code: string;
  kind: "required" | "elective";
  bucket: string;
  status: "completed" | "in_progress" | "planned";
};

type TimelineSemester<C extends TimelineCourse> = { id: string; courses: C[] };

function compatible<C extends TimelineCourse>(source: C, candidate: C) {
  if (candidate.status !== "planned") return false;
  if (source.kind === "required") return candidate.kind === "required";
  return candidate.kind === "elective" && candidate.bucket === source.bucket;
}

function swapPreservingSlots<C extends TimelineCourse>(left: C, right: C): [C, C] {
  return [
    { ...right, slotId: left.slotId },
    { ...left, slotId: right.slotId },
  ];
}

/**
 * Enforce the planner timeline invariant:
 * - in-progress work belongs only to the selected current semester;
 * - completed work belongs before the current semester;
 * - moving a course displaces a still-planned requirement into its old slot.
 */
export function alignRecordedCoursesToTimeline<
  C extends TimelineCourse,
  S extends TimelineSemester<C>,
>(schedule: S[], currentSemesterNumber: number): S[] {
  if (currentSemesterNumber <= 0 || !schedule.length) return schedule;
  const currentIndex = Math.min(schedule.length - 1, currentSemesterNumber - 1);
  const next = schedule.map(semester => ({
    ...semester,
    courses: semester.courses.map(course => ({ ...course })),
  })) as S[];

  const findCourse = (code: string, status: C["status"]) => {
    for (let semesterIndex = 0; semesterIndex < next.length; semesterIndex += 1) {
      const courseIndex = next[semesterIndex].courses.findIndex(course => course.code === code && course.status === status);
      if (courseIndex >= 0) return { semesterIndex, courseIndex };
    }
    return null;
  };

  const currentCodes = [...new Set(next.flatMap(semester => semester.courses)
    .filter(course => course.status === "in_progress").map(course => course.code))];
  for (const code of currentCodes) {
    const source = findCourse(code, "in_progress");
    if (!source || source.semesterIndex === currentIndex) continue;
    const sourceCourse = next[source.semesterIndex].courses[source.courseIndex];
    let targetIndex = next[currentIndex].courses.findIndex(course => compatible(sourceCourse, course));
    if (targetIndex < 0) targetIndex = next[currentIndex].courses.findIndex(course => course.status === "planned");
    if (targetIndex >= 0) {
      const targetCourse = next[currentIndex].courses[targetIndex];
      const [sourceReplacement, currentCourse] = swapPreservingSlots(sourceCourse, targetCourse);
      next[source.semesterIndex].courses[source.courseIndex] = sourceReplacement;
      next[currentIndex].courses[targetIndex] = currentCourse;
    } else {
      next[source.semesterIndex].courses.splice(source.courseIndex, 1);
      next[currentIndex].courses.push({
        ...sourceCourse,
        slotId: `${next[currentIndex].id}-current-${next[currentIndex].courses.length + 1}`,
      });
    }
  }

  const completedCodes = [...new Set(next.flatMap(semester => semester.courses)
    .filter(course => course.status === "completed").map(course => course.code))];
  for (const code of completedCodes) {
    const source = findCourse(code, "completed");
    if (!source || source.semesterIndex < currentIndex) continue;
    const sourceCourse = next[source.semesterIndex].courses[source.courseIndex];
    let target: { semesterIndex: number; courseIndex: number } | null = null;
    for (let semesterIndex = currentIndex - 1; semesterIndex >= 0 && !target; semesterIndex -= 1) {
      let courseIndex = next[semesterIndex].courses.findIndex(course => compatible(sourceCourse, course));
      if (courseIndex < 0) courseIndex = next[semesterIndex].courses.findIndex(course => course.status === "planned");
      if (courseIndex >= 0) target = { semesterIndex, courseIndex };
    }
    if (target) {
      const targetCourse = next[target.semesterIndex].courses[target.courseIndex];
      const [sourceReplacement, historicalCourse] = swapPreservingSlots(sourceCourse, targetCourse);
      next[source.semesterIndex].courses[source.courseIndex] = sourceReplacement;
      next[target.semesterIndex].courses[target.courseIndex] = historicalCourse;
    } else if (currentIndex > 0) {
      next[source.semesterIndex].courses.splice(source.courseIndex, 1);
      next[currentIndex - 1].courses.push({
        ...sourceCourse,
        slotId: `${next[currentIndex - 1].id}-completed-${next[currentIndex - 1].courses.length + 1}`,
      });
    }
  }

  // The selected current semester is a statement of what the student is
  // actually taking, not another recommendation bucket. Push any untouched
  // sample-plan courses forward instead of implying current enrollment.
  const plannedInCurrent = next[currentIndex].courses.filter(course => course.status === "planned");
  next[currentIndex].courses = next[currentIndex].courses.filter(course => course.status !== "planned");
  for (const course of plannedInCurrent) {
    let futureIndex = -1;
    let smallestCourseCount = Number.POSITIVE_INFINITY;
    for (let semesterIndex = currentIndex + 1; semesterIndex < next.length; semesterIndex += 1) {
      const courseCount = next[semesterIndex].courses.length;
      if (courseCount < smallestCourseCount) {
        smallestCourseCount = courseCount;
        futureIndex = semesterIndex;
      }
    }
    if (futureIndex >= 0) {
      next[futureIndex].courses.push({
        ...course,
        slotId: `${next[futureIndex].id}-deferred-${next[futureIndex].courses.length + 1}`,
      });
    }
  }

  return next;
}
