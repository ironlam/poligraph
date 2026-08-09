import type { MandateType } from "@/types";
import type { TimelineMandate } from "../types";

export function mandate(over: Partial<TimelineMandate> & { type: MandateType }): TimelineMandate {
  return {
    id: "m1",
    publicId: "MA-000001",
    politicianId: "p1",
    title: "",
    institution: "",
    role: null,
    constituency: null,
    departmentCode: null,
    senateSeries: null,
    startDate: new Date("2022-06-22"),
    endDate: null,
    isCurrent: true,
    source: null,
    partyId: null,
    externalId: null,
    sourceUrl: null,
    officialUrl: null,
    createdAt: new Date("2022-06-22"),
    updatedAt: new Date("2022-06-22"),
    party: null,
    parliamentaryData: null,
    europeanData: null,
    ...over,
  };
}
