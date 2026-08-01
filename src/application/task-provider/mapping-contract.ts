import { z } from "zod";

/**
 * Declares whether a provider field is required or optional when mapping tasks into the domain model.
 */
export const mappingRequirementSchema = z.enum(["required", "optional"]);

/**
 * Declares whether a provider field is required or optional when mapping tasks into the domain model.
 */
export type MappingRequirement = z.infer<typeof mappingRequirementSchema>;

/**
 * Describes one internal task field and the provider fact needed to populate it safely.
 */
export const taskMappingFieldSchema = z.object({
  domainField: z.string().min(1),
  requirement: mappingRequirementSchema,
  description: z.string().min(1),
});

/**
 * Describes one internal task field and the provider fact needed to populate it safely.
 */
export type TaskMappingField = z.infer<typeof taskMappingFieldSchema>;

/**
 * Describes the provider facts needed to create a valid internal task model.
 */
export const taskProviderMappingContractSchema = z.object({
  requiredFields: z.array(taskMappingFieldSchema),
  optionalFields: z.array(taskMappingFieldSchema),
});

/**
 * Describes the provider facts needed to create a valid internal task model.
 */
export type TaskProviderMappingContract = z.infer<
  typeof taskProviderMappingContractSchema
>;

/**
 * Shared mapping contract that any task provider must satisfy when building domain tasks.
 */
export const taskProviderMappingContract: TaskProviderMappingContract = {
  requiredFields: [
    {
      domainField: "id",
      requirement: "required",
      description: "Stable provider identifier used for future reads and mutations.",
    },
    {
      domainField: "title",
      requirement: "required",
      description: "Primary task title shown to the user and model.",
    },
    {
      domainField: "priority",
      requirement: "required",
      description:
        "Explicit provider priority mapped into the internal low/medium/high/urgent scale.",
    },
  ],
  optionalFields: [
    {
      domainField: "description",
      requirement: "optional",
      description:
        "Additional provider text that may help conversation or selection without being required.",
    },
    {
      domainField: "projectName",
      requirement: "optional",
      description:
        "Plain project or list name used for context without leaking provider project metadata.",
    },
    {
      domainField: "dueDate",
      requirement: "optional",
      description:
        "Structured due-date facts mapped into either date-only or date-time domain form.",
    },
    {
      domainField: "createdAt",
      requirement: "optional",
      description:
        "Original provider creation timestamp used for age-related ranking when available.",
    },
  ],
};
