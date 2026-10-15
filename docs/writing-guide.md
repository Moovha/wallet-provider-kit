# Writing for people

Write as a helpful teammate: friendly, direct and specific. Readers may be
building their first wallet integration or reviewing a financial control. Give
them what they need to understand the choice and take the next step.

## Our voice

[Moovha](https://moovha.com) talks about money in terms of everyday life: getting
paid, saving, spending and staying in control. Our developer docs carry that same
practical outlook. Explain what someone can do, who has control and what still
needs work. Keep the philosophy brief and make it concrete in the instructions.

- Talk to the reader as **you**. Use **we** for project maintainers. Contractions
  such as “you'll” and “doesn't” are welcome.
- Start with the task or useful result. Put commands and prerequisites close
  together; move detailed background into the relevant guide.
- Use familiar words and explain unfamiliar terms on first use. Keep API names,
  field values and protocol terms exact.
- Be friendly without slang, jokes or sales language. Avoid “just”, “easy” and
  “obviously” when they dismiss work the reader still has to do.
- Explain a limit with its reason and next step. Security requirements stay firm:
  use **must** for requirements and **can** for options.
- Describe what works today. Label drafts, untested behavior and future plans.
  Support standards claims with primary sources; don't imply compliance,
  self-custody or certification from a feature name.

## In practice

| Instead of                                         | Write                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| “Merely adding credentials cannot enable signing.” | “Adding credentials isn't enough. Your application must also supply authorization and recovery.”           |
| “Reconcile uncertain outcomes.”                    | “If a response is lost, check the original attempt before retrying. The provider may already have signed.” |
| “No sibling dependency is needed.”                 | “You can install and run this kit on its own.”                                                             |

Before submitting, read the changed text aloud. Check that a newcomer can find
the next step and an experienced reader can still identify the exact requirement.

This guide draws on [Google's developer documentation tone guidance](https://developers.google.com/style/tone)
and [Microsoft's simple, human voice principles](https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human).
For project structure, see [GitHub's README guidance](https://opensource.guide/starting-a-project/#writing-a-readme)
and [OpenSSF's documentation criteria](https://www.bestpractices.dev/en/criteria/0).
