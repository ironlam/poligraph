import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeMailjetError } from "../mailjet-error";

const { postRequest, getRequest, get } = vi.hoisted(() => ({
  postRequest: vi.fn(),
  getRequest: vi.fn(),
  get: vi.fn(),
}));

vi.mock("node-mailjet", () => {
  const chain = { id: () => chain, action: () => chain, request: postRequest };
  return {
    default: class {
      post = () => chain;
      get = get;
    },
  };
});

import { subscribeToNewsletter } from "../mailjet";

// Shape of what node-mailjet 6 throws on an HTTP error.
function mailjetError(statusCode: number, errorMessage: string) {
  return Object.assign(
    new Error(`Unsuccessful: Status Code: "${statusCode}" Message: "${errorMessage}"`),
    {
      statusCode,
      originalMessage: errorMessage,
      ErrorMessage: errorMessage,
      config: {
        auth: { username: "key-public", password: "key-secret" },
        headers: { Authorization: "Basic a2V5LXB1YmxpYzprZXktc2VjcmV0" },
        data: '{"Email":"jane.doe@example.org"}',
      },
    }
  );
}

const ALREADY_EXISTS =
  'MJ18 A Contact resource with value "jane.doe@example.org" for Email already exists.';

describe("describeMailjetError", () => {
  it("keeps the status and message, drops credentials and addresses", () => {
    const line = describeMailjetError(mailjetError(400, ALREADY_EXISTS));

    expect(line).toContain("status=400");
    expect(line).toContain("MJ18");
    expect(line).not.toContain("key-secret");
    expect(line).not.toContain("Basic ");
    expect(line).not.toContain("jane.doe@example.org");
  });

  it("copes with values that are not Mailjet errors", () => {
    expect(describeMailjetError(new Error("boom"))).toBe("status=? boom");
    expect(describeMailjetError(undefined)).toBe("status=? unknown error");
  });
});

describe("subscribeToNewsletter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MAILJET_LIST_ID", "42");
    get.mockReturnValue({ request: getRequest });
  });

  it("adds an already known contact to the list", async () => {
    postRequest
      .mockRejectedValueOnce(mailjetError(400, ALREADY_EXISTS))
      .mockResolvedValueOnce({ body: {} });
    getRequest.mockResolvedValueOnce({ body: { Data: [{ ID: 7 }] } });

    await expect(subscribeToNewsletter("jane.doe@example.org")).resolves.toEqual({
      success: true,
    });

    expect(get).toHaveBeenCalledWith("contact/jane.doe%40example.org");
    expect(postRequest).toHaveBeenLastCalledWith({
      ContactsLists: [{ ListID: 42, Action: "addnoforce" }],
    });
  });

  it("still fails on any other Mailjet error", async () => {
    postRequest.mockRejectedValueOnce(mailjetError(401, "Unauthorized"));

    await expect(subscribeToNewsletter("jane.doe@example.org")).rejects.toThrow("401");
    expect(get).not.toHaveBeenCalled();
  });
});
