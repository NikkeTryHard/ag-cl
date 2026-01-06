/**
 * Unit tests for schema-sanitizer.ts
 *
 * Tests JSON Schema cleaning and transformation for Gemini/Antigravity API compatibility.
 */

import { describe, it, expect } from "vitest";
import { sanitizeSchema, cleanSchemaForGemini } from "../../../src/format/schema-sanitizer.js";
import type { JSONSchema } from "../../../src/format/types.js";

describe("sanitizeSchema", () => {
  describe("null and empty inputs", () => {
    it("returns placeholder schema for null input", () => {
      const result = sanitizeSchema(null as unknown as JSONSchema);
      expect(result).toEqual({
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Reason for calling this tool",
          },
        },
        required: ["reason"],
      });
    });

    it("returns placeholder schema for undefined input", () => {
      const result = sanitizeSchema(undefined as unknown as JSONSchema);
      expect(result).toEqual({
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Reason for calling this tool",
          },
        },
        required: ["reason"],
      });
    });

    it("returns placeholder schema for empty object", () => {
      const result = sanitizeSchema({});
      expect(result).toEqual({
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Reason for calling this tool",
          },
        },
        required: ["reason"],
      });
    });

    it("returns placeholder for object type with no properties", () => {
      const result = sanitizeSchema({ type: "object" });
      expect(result).toEqual({
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Reason for calling this tool",
          },
        },
        required: ["reason"],
      });
    });
  });

  describe("const conversion", () => {
    it("converts const to enum", () => {
      const result = sanitizeSchema({
        type: "string",
        const: "fixed_value",
      });
      expect(result.enum).toEqual(["fixed_value"]);
      expect(result.const).toBeUndefined();
    });

    it("converts nested const to enum", () => {
      const result = sanitizeSchema({
        type: "object",
        properties: {
          status: { type: "string", const: "active" },
        },
      });
      expect(result.properties?.status?.enum).toEqual(["active"]);
    });
  });

  describe("unsupported field filtering", () => {
    it("removes unsupported fields", () => {
      const result = sanitizeSchema({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "test-schema",
        additionalProperties: false,
        default: {},
        minLength: 1,
        maxLength: 100,
      });
      expect(result.$schema).toBeUndefined();
      expect(result.$id).toBeUndefined();
      expect(result.additionalProperties).toBeUndefined();
      expect(result.default).toBeUndefined();
      expect(result.minLength).toBeUndefined();
      expect(result.maxLength).toBeUndefined();
    });

    it("keeps allowed fields", () => {
      const result = sanitizeSchema({
        type: "object",
        description: "A test schema",
        properties: {
          name: { type: "string", description: "Name field" },
        },
        required: ["name"],
        title: "TestSchema",
        enum: ["a", "b"],
      });
      expect(result.type).toBe("object");
      expect(result.description).toBe("A test schema");
      expect(result.properties?.name?.description).toBe("Name field");
      expect(result.required).toEqual(["name"]);
      expect(result.title).toBe("TestSchema");
      expect(result.enum).toEqual(["a", "b"]);
    });
  });

  describe("recursive sanitization", () => {
    it("sanitizes nested properties", () => {
      const result = sanitizeSchema({
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              email: {
                type: "string",
                format: "email",
                pattern: ".*@.*",
              },
            },
          },
        },
      });
      expect(result.properties?.user?.properties?.email?.format).toBeUndefined();
      expect(result.properties?.user?.properties?.email?.pattern).toBeUndefined();
    });

    it("sanitizes array items", () => {
      const result = sanitizeSchema({
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer", minimum: 0 },
          },
        },
      });
      const items = result.items as JSONSchema;
      expect(items.properties?.id?.minimum).toBeUndefined();
    });

    it("sanitizes tuple items array", () => {
      const result = sanitizeSchema({
        type: "array",
        items: [
          { type: "string", minLength: 1 },
          { type: "number", minimum: 0 },
        ],
      });
      const items = result.items as JSONSchema[];
      expect(items[0].minLength).toBeUndefined();
      expect(items[1].minimum).toBeUndefined();
    });
  });

  describe("type default", () => {
    it("defaults type to object when missing", () => {
      const result = sanitizeSchema({
        properties: {
          name: { type: "string" },
        },
      });
      expect(result.type).toBe("object");
    });
  });
});

describe("cleanSchemaForGemini", () => {
  describe("null and edge cases", () => {
    it("returns input for null", () => {
      expect(cleanSchemaForGemini(null as unknown as JSONSchema)).toBeNull();
    });

    it("returns input for undefined", () => {
      expect(cleanSchemaForGemini(undefined as unknown as JSONSchema)).toBeUndefined();
    });

    it("returns input for non-object", () => {
      expect(cleanSchemaForGemini("string" as unknown as JSONSchema)).toBe("string");
    });
  });

  describe("$ref handling", () => {
    it("converts $ref to type object with description hint", () => {
      const result = cleanSchemaForGemini({
        $ref: "#/$defs/UserProfile",
      });
      expect(result.type).toBe("object");
      expect(result.description).toBe("See: UserProfile");
      expect(result.$ref).toBeUndefined();
    });

    it("merges existing description with $ref hint", () => {
      const result = cleanSchemaForGemini({
        $ref: "#/definitions/Address",
        description: "User address",
      });
      expect(result.description).toBe("User address (See: Address)");
    });

    it("handles nested $refs in properties", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          profile: { $ref: "#/$defs/Profile" },
        },
      });
      expect(result.properties?.profile?.type).toBe("object");
      expect(result.properties?.profile?.description).toBe("See: Profile");
    });
  });

  describe("allOf merging", () => {
    it("merges allOf schemas", () => {
      const result = cleanSchemaForGemini({
        allOf: [{ type: "object", properties: { name: { type: "string" } } }, { properties: { age: { type: "number" } } }],
      });
      expect(result.allOf).toBeUndefined();
      expect(result.properties?.name?.type).toBe("string");
      expect(result.properties?.age?.type).toBe("number");
    });

    it("merges required arrays from allOf", () => {
      const result = cleanSchemaForGemini({
        allOf: [{ type: "object", required: ["name"] }, { required: ["age"] }],
      });
      expect(result.required).toEqual(expect.arrayContaining(["name", "age"]));
    });

    it("handles nested allOf in properties", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          data: {
            allOf: [{ type: "object", properties: { x: { type: "number" } } }, { properties: { y: { type: "number" } } }],
          },
        },
      });
      expect(result.properties?.data?.properties?.x?.type).toBe("number");
      expect(result.properties?.data?.properties?.y?.type).toBe("number");
    });
  });

  describe("anyOf flattening", () => {
    it("flattens anyOf by selecting best option", () => {
      const result = cleanSchemaForGemini({
        anyOf: [{ type: "null" }, { type: "object", properties: { id: { type: "string" } } }],
      });
      expect(result.anyOf).toBeUndefined();
      expect(result.type).toBe("object");
      expect(result.properties?.id?.type).toBe("string");
    });

    it("adds type hint for multiple types", () => {
      const result = cleanSchemaForGemini({
        anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
      });
      expect(result.description).toContain("Accepts:");
      expect(result.description).toContain("string");
      expect(result.description).toContain("number");
    });

    it("flattens oneOf similarly to anyOf", () => {
      const result = cleanSchemaForGemini({
        oneOf: [{ type: "string" }, { type: "object", properties: { value: { type: "string" } } }],
      });
      expect(result.oneOf).toBeUndefined();
      expect(result.type).toBe("object");
    });
  });

  describe("nullable types", () => {
    it("flattens type array and marks nullable", () => {
      const result = cleanSchemaForGemini({
        type: ["string", "null"],
      });
      expect(result.type).toBe("string");
      expect(result.description).toContain("nullable");
    });

    it("handles type array with multiple non-null types", () => {
      const result = cleanSchemaForGemini({
        type: ["string", "number"],
      });
      expect(result.type).toBe("string");
      expect(result.description).toContain("Accepts:");
    });

    it("removes nullable properties from required", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          name: { type: "string" },
          nickname: { type: ["string", "null"] },
        },
        required: ["name", "nickname"],
      });
      expect(result.required).toEqual(["name"]);
    });

    it("deletes empty required array", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          optional: { type: ["string", "null"] },
        },
        required: ["optional"],
      });
      expect(result.required).toBeUndefined();
    });
  });

  describe("enum hints", () => {
    it("adds enum values to description", () => {
      const result = cleanSchemaForGemini({
        type: "string",
        enum: ["active", "pending", "completed"],
      });
      expect(result.description).toContain("Allowed:");
      expect(result.description).toContain("active");
      expect(result.description).toContain("pending");
      expect(result.description).toContain("completed");
    });

    it("does not add hint for single enum value", () => {
      const result = cleanSchemaForGemini({
        type: "string",
        enum: ["only_one"],
      });
      // Description is undefined when no hint is added
      expect(result.description ?? "").not.toContain("Allowed:");
    });

    it("does not add hint for more than 10 enum values", () => {
      const result = cleanSchemaForGemini({
        type: "string",
        enum: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"],
      });
      // Description is undefined when no hint is added
      expect(result.description ?? "").not.toContain("Allowed:");
    });
  });

  describe("additionalProperties hints", () => {
    it("adds hint for additionalProperties: false", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: { name: { type: "string" } },
        additionalProperties: false,
      });
      expect(result.description).toContain("No extra properties allowed");
      expect(result.additionalProperties).toBeUndefined();
    });
  });

  describe("constraint hints", () => {
    it("adds constraints to description before stripping", () => {
      const result = cleanSchemaForGemini({
        type: "string",
        minLength: 1,
        maxLength: 100,
        pattern: "^[a-z]+$",
      });
      expect(result.description).toContain("minLength: 1");
      expect(result.description).toContain("maxLength: 100");
      expect(result.description).toContain("pattern:");
      expect(result.minLength).toBeUndefined();
      expect(result.maxLength).toBeUndefined();
      expect(result.pattern).toBeUndefined();
    });

    it("adds numeric constraints to description", () => {
      const result = cleanSchemaForGemini({
        type: "number",
        minimum: 0,
        maximum: 100,
      });
      expect(result.description).toContain("minimum: 0");
      expect(result.description).toContain("maximum: 100");
      // Note: minimum and maximum are not in the unsupported list, so they are kept
      // They are only added to description as hints
    });

    it("adds array constraints to description", () => {
      const result = cleanSchemaForGemini({
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 10,
      });
      expect(result.description).toContain("minItems: 1");
      expect(result.description).toContain("maxItems: 10");
      expect(result.minItems).toBeUndefined();
      expect(result.maxItems).toBeUndefined();
    });

    it("adds format to description", () => {
      const result = cleanSchemaForGemini({
        type: "string",
        format: "email",
      });
      expect(result.description).toContain("format: email");
      expect(result.format).toBeUndefined();
    });
  });

  describe("unsupported keyword removal", () => {
    it("removes $defs and definitions", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: { name: { type: "string" } },
        $defs: { User: { type: "object" } },
        definitions: { Profile: { type: "object" } },
      });
      expect(result.$defs).toBeUndefined();
      expect(result.definitions).toBeUndefined();
    });

    it("removes $id, $comment, $schema", () => {
      const result = cleanSchemaForGemini({
        $id: "my-schema",
        $comment: "This is a comment",
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: { name: { type: "string" } },
      });
      expect(result.$id).toBeUndefined();
      expect(result.$comment).toBeUndefined();
      expect(result.$schema).toBeUndefined();
    });

    it("removes title, examples, default", () => {
      const result = cleanSchemaForGemini({
        type: "string",
        title: "Username",
        examples: ["john", "jane"],
        default: "guest",
      });
      expect(result.title).toBeUndefined();
      expect(result.examples).toBeUndefined();
      expect(result.default).toBeUndefined();
    });
  });

  describe("required array validation", () => {
    it("filters required array to only include existing properties", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name", "missing_field"],
      });
      expect(result.required).toEqual(["name"]);
    });

    it("removes empty required array after filtering", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["nonexistent"],
      });
      expect(result.required).toBeUndefined();
    });
  });

  describe("recursive processing", () => {
    it("processes deeply nested properties", () => {
      const result = cleanSchemaForGemini({
        type: "object",
        properties: {
          level1: {
            type: "object",
            properties: {
              level2: {
                type: "object",
                properties: {
                  value: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      });
      expect(result.properties?.level1?.properties?.level2?.properties?.value?.type).toBe("string");
      expect(result.properties?.level1?.properties?.level2?.properties?.value?.description).toContain("nullable");
    });

    it("processes array items recursively", () => {
      const result = cleanSchemaForGemini({
        type: "array",
        items: {
          type: "object",
          properties: {
            data: { $ref: "#/$defs/Data" },
          },
        },
      });
      const items = result.items as JSONSchema;
      expect(items.properties?.data?.type).toBe("object");
      expect(items.properties?.data?.description).toBe("See: Data");
    });

    it("processes tuple items recursively", () => {
      const result = cleanSchemaForGemini({
        type: "array",
        items: [{ type: ["string", "null"] }, { $ref: "#/$defs/Item" }],
      });
      const items = result.items as JSONSchema[];
      expect(items[0].type).toBe("string");
      expect(items[1].type).toBe("object");
    });
  });

  describe("array handling", () => {
    it("processes array of schemas", () => {
      const input = [{ type: "string", minLength: 1 }, { type: "number" }] as unknown as JSONSchema;
      const result = cleanSchemaForGemini(input) as unknown as JSONSchema[];
      // minLength is in the unsupported list and should be removed
      expect(result[0].minLength).toBeUndefined();
      expect(result[0].type).toBe("string");
      expect(result[1].type).toBe("number");
    });
  });
});
