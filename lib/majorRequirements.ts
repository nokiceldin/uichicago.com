export type MajorCategory = {
  key: string;
  label: string;
  courses: string[];
};

export type MajorRequirement = {
  key: string;
  label: string;
  categories: MajorCategory[];
};

export const majorRequirements: MajorRequirement[] = [
  {
    key: "computer-science",
    label: "Computer Science",
    categories: [
      {
        key: "engineering-required",
        label: "College of Engineering required courses",
        courses: [
          "ENGR 100",
          "ENGR 101",
          "CS 111",
          "CS 112",
          "CS 113",
          "CS 141",
          "CS 151",
          "CS 211",
          "CS 251",
          "CS 261",
          "CS 277",
          "CS 301",
          "CS 341",
          "CS 342",
          "CS 361",
          "CS 362",
          "CS 377",
          "CS 401",
          "CS 499",
        ],
      },
      {
        key: "technical-electives",
        label: "Technical electives",
        courses: [
          "CS 351",
          "CS 378",
          "CS 398",
          "CS 402",
          "CS 407",
          "CS 411",
          "CS 412",
          "CS 415",
          "CS 418",
          "CS 421",
          "CS 422",
          "CS 424",
          "CS 425",
          "CS 426",
          "CS 427",
          "CS 428",
          "CS 440",
          "CS 441",
          "CS 442",
          "CS 450",
          "CS 453",
          "CS 454",
          "CS 455",
          "CS 461",
          "CS 463",
          "CS 466",
          "CS 468",
          "CS 473",
          "CS 474",
          "CS 476",
          "CS 477",
          "CS 478",
          "CS 479",
          "CS 480",
          "CS 483",
          "CS 484",
          "CS 485",
          "CS 487",
          "CS 488",
          "CS 489",
          "ECE 469",
          "IT 301",
          "IT 302",
          "MCS 320",
          "MCS 425",
          "MCS 471",
          "MCS 481",
          "STAT 471",
        ],
      },
      {
        key: "required-math",
        label: "Required math courses",
        courses: [
          "IE 342",
          "STAT 381",
          "MATH 215",
          "MATH 220",
          "MATH 218",
          "MATH 320",
          "MATH 430",
          "MATH 435",
          "MATH 436",
          "MCS 421",
          "MCS 423",
          "MCS 471",
          "STAT 401",
          "STAT 473",
        ],
      },
      {
        key: "science-electives",
        label: "Science electives",
        courses: [
          "BIOS 110",
          "BIOS 120",
          "CHEM 122",
          "CHEM 123",
          "CHEM 116",
          "CHEM 124",
          "CHEM 125",
          "CHEM 118",
          "PHYS 141",
          "PHYS 142",
          "EAES 101",
          "EAES 111",
        ],
      },
    ],
  },
  {
  key: "health-information-management",
  label: "Health Information Management",
  categories: [
    {
      key: "pre-him-required",
      label: "Pre-Health Information Management required courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "BIOS 110",
        "KN 230",
        "KN 231",
        "MATH 110",
        "MATH 105",
        "PSCH 100",
        "PSCH 242",
        "STAT 101",
        "IDS 200",
      ],
    },
    {
      key: "him-required",
      label: "Health Information Management required courses",
      courses: [
        "HIM 101",
        "HIM 410",
        "HIM 317",
        "HIM 319",
        "HIM 320",
        "HIM 329",
        "HIM 432",
        "HIM 433",
        "HIM 337",
        "HIM 343",
        "HIM 361",
        "HIM 367",
        "HIM 374",
        "HIM 377",
        "HIM 384",
        "HIM 481",
        "BHIS 405",
        "BHIS 406",
        "BHIS 410",
        "BHIS 460",
        "BHIS 461",
        "BHIS 480",
      ],
    },
  ],
},
{
  key: "health-information-management-health-informatics",
  label: "Health Information Management / Health Informatics (Joint BS/MS)",
  categories: [
    {
      key: "pre-him-required",
      label: "Pre-Health Information Management required courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "BIOS 110",
        "KN 230",
        "KN 231",
        "MATH 110",
        "STAT 101",
        "PSCH 100",
        "IDS 200"
      ],
    },
    {
      key: "him-core",
      label: "Health Information Management core courses",
      courses: [
        "HIM 101",
        "HIM 410",
        "HIM 317",
        "HIM 319",
        "HIM 320",
        "HIM 329",
        "HIM 361",
        "HIM 432",
        "HIM 433",
        "HIM 337",
        "HIM 343",
        "HIM 374",
        "HIM 377",
        "HIM 384",
        "HIM 481",
        "BHIS 405",
        "BHIS 406",
        "BHIS 410",
        "BHIS 460",
        "BHIS 461",
        "BHIS 480"
      ],
    },
    {
      key: "health-informatics-graduate",
      label: "Health Informatics graduate courses",
      courses: [
        "BHIS 437",
        "BHIS 520",
        "BHIS 499",
        "BHIS 515",
        "BHIS 503",
        "BHIS 505",
        "BHIS 525",
        "BHIS 593",
        "BHIS 530"
      ],
    }
  ],
},
{
  key: "disability-and-human-development",
  label: "Disability and Human Development",
  categories: [
    {
      key: "dhd-core",
      label: "Disability and Human Development core courses",
      courses: [
        "DHD 100",
        "DHD 101",
        "DHD 102",
        "DHD 201",
        "DHD 202",
        "DHD 301",
        "DHD 302",
        "DHD 303",
        "DHD 400",
        "DHD 401"
      ],
    },
    {
      key: "dhd-electives",
      label: "Disability and Human Development electives",
      courses: [
        "DHD 203",
        "DHD 204",
        "DHD 205",
        "DHD 206",
        "DHD 403",
        "DHD 404",
        "DHD 407",
        "DHD 408",
        "DHD 409",
        "DHD 420",
        "DHD 440",
        "DHD 494"
      ],
    }
  ],
},
{
  key: "kinesiology",
  label: "Kinesiology",
  categories: [
    {
      key: "kinesiology-core",
      label: "Kinesiology core courses",
      courses: [
        "HN 196",
        "KN 100",
        "KN 136",
        "KN 200",
        "KN 237",
        "KN 243",
        "KN 245",
        "KN 230",
        "KN 231",
        "KN 232",
        "KN 233",
        "KN 261",
        "KN 336",
        "KN 352",
        "KN 361",
        "KN 362",
        "KN 372",
        "KN 491",
        "KN 495"
      ],
    },
    {
      key: "kinesiology-foundations",
      label: "Kinesiology foundational science courses",
      courses: [
        "BIOS 110",
        "KN 152",
        "PSCH 100",
        "KN 150",
        "MATH 121",
        "CHEM 101",
        "PHYS 131"
      ],
    },
    {
      key: "kinesiology-experiential",
      label: "Kinesiology experiential learning courses",
      courses: [
        "KN 299",
        "KN 393",
        "KN 396",
        "KN 397",
        "KN 398",
        "KN 399",
        "KN 493"
      ],
    }
  ],
},
{
  key: "rehabilitation-sciences",
  label: "Rehabilitation Sciences",
  categories: [
    {
      key: "rehab-core",
      label: "Rehabilitation Sciences core courses",
      courses: [
        "AHS 101",
        "AHS 102",
        "AHS 210",
        "AHS 325",
        "AHS 330",
        "AHS 365",
        "AHS 375",
        "AHS 393",
        "AHS 402",
        "BHIS 406",
        "BHIS 460",
        "DHD 101",
        "DHD 440",
        "HIM 410",
        "KN 230",
        "KN 231",
        "PSCH 242",
        "PSCH 270",
        "PSCH 312",
        "PSCH 315",
        "PSCH 320",
        "PSCH 324",
        "STAT 101"
      ],
    },
    {
      key: "rehab-selectives",
      label: "Rehabilitation Sciences selectives",
      courses: [
        "AHS 304",
        "AHS 405",
        "AHS 425",
        "DHD 102",
        "DHD 201",
        "DHD 202",
        "DHD 203",
        "DHD 204",
        "DHD 205",
        "DHD 206",
        "DHD 303",
        "DHD 403",
        "DHD 411",
        "DHD 412",
        "DHD 441",
        "PSCH 366",
        "PT 350",
        "OT 350"
      ],
    },
    {
      key: "rehab-foundations",
      label: "Rehabilitation Sciences foundational courses",
      courses: [
        "BIOS 110",
        "PSCH 100"
      ],
    }
  ],
},
{
  key: "architecture",
  label: "Architecture",
  categories: [
    {
      key: "architecture-core",
      label: "Architecture core courses",
      courses: [
        "ARCH 105",
        "ARCH 106",
        "ARCH 151",
        "ARCH 205",
        "ARCH 206",
        "ARCH 251",
        "ARCH 252",
        "ARCH 359",
        "ARCH 360",
        "ARCH 365",
        "ARCH 366",
        "ARCH 371",
        "ARCH 372",
        "ARCH 470",
        "ARCH 471",
        "ARCH 414",
        "ARCH 465",
        "ARCH 466"
      ],
    },
    {
      key: "architecture-foundations",
      label: "Architecture foundational courses",
      courses: [
        "MATH 180",
        "PHYS 131",
        "ENGL 160",
        "ENGL 161"
      ],
    },
    {
      key: "architecture-art-history",
      label: "Architecture art history requirement",
      courses: [
        "ARTH 100",
        "ARTH 101",
        "ARTH 102",
        "ARTH 103",
        "ARTH 104",
        "ARTH 105",
        "ARTH 106",
        "ARTH 107",
        "ARTH 108",
        "ARTH 109",
        "ARTH 110",
        "ARTH 111",
        "ARTH 112",
        "ARTH 113",
        "ARTH 114",
        "ARTH 115",
        "ARTH 116",
        "ARTH 117",
        "ARTH 118",
        "ARTH 119",
        "ARTH 120",
        "ARTH 121",
        "ARTH 122",
        "ARTH 123",
        "ARTH 124",
        "ARTH 125",
        "ARTH 126",
        "ARTH 127",
        "ARTH 128",
        "ARTH 129",
        "ARTH 130",
        "ARTH 131",
        "ARTH 132",
        "ARTH 133",
        "ARTH 134",
        "ARTH 135",
        "ARTH 136",
        "ARTH 137",
        "ARTH 138",
        "ARTH 139",
        "ARTH 140"
      ],
    },
    {
      key: "architecture-dialogue",
      label: "UIC first year dialogue seminar",
      courses: [
        "DLG 120"
      ],
    }
  ],
},
{
  key: "accounting",
  label: "Accounting",
  categories: [
    {
      key: "accounting-major-core",
      label: "Accounting major required courses",
      courses: [
        "ACTG 315",
        "ACTG 316",
        "ACTG 326",
        "ACTG 435",
        "ACTG 445",
        "ACTG 474"
      ],
    },
    {
      key: "accounting-electives",
      label: "Accounting electives",
      courses: [
        "ACTG 355",
        "ACTG 417",
        "ACTG 436",
        "ACTG 437",
        "ACTG 446",
        "ACTG 447",
        "ACTG 456",
        "ACTG 465",
        "ACTG 470",
        "ACTG 475",
        "ACTG 476",
        "ACTG 484",
        "ACTG 485",
        "ACTG 492",
        "ACTG 493",
        "ACTG 494"
      ],
    },
    {
      key: "accounting-prerequisites",
      label: "Accounting prerequisite courses",
      courses: [
        "IDS 200",
        "IDS 270",
        "ECON 120",
        "ECON 121"
      ],
    }
  ],
},
{
  key: "finance",
  label: "Finance",
  categories: [
    {
      key: "finance-core",
      label: "Finance core courses",
      courses: [
        "FIN 310",
        "FIN 320"
      ],
    },
    {
      key: "finance-electives",
      label: "Finance major electives",
      courses: [
        "FIN 250",
        "FIN 300",
        "FIN 301",
        "FIN 302",
        "FIN 310",
        "FIN 320",
        "FIN 330",
        "FIN 340",
        "FIN 350",
        "FIN 360",
        "FIN 370",
        "FIN 380",
        "FIN 390",
        "FIN 410",
        "FIN 420",
        "FIN 430",
        "FIN 440",
        "FIN 450",
        "FIN 460",
        "FIN 470",
        "FIN 480",
        "FIN 490"
      ],
    },
    {
      key: "finance-related-business",
      label: "Finance related business electives",
      courses: [
        "ACTG 444",
        "ACTG 445"
      ],
    }
  ],
},
{
  key: "information-and-decision-sciences",
  label: "Information and Decision Sciences",
  categories: [
    {
      key: "ids-core",
      label: "Information and Decision Sciences core courses",
      courses: [
        "IDS 200",
        "IDS 270",
        "IDS 300",
        "IDS 355",
        "IDS 371",
        "IDS 410",
        "IDS 435"
      ],
    },
    {
      key: "ids-analytics",
      label: "Business analytics related courses",
      courses: [
        "IDS 312",
        "IDS 406",
        "IDS 407",
        "IDS 408",
        "IDS 409"
      ],
    },
    {
      key: "ids-supply-chain",
      label: "Supply chain and operations courses",
      courses: [
        "IDS 331",
        "IDS 340",
        "IDS 341",
        "IDS 342"
      ],
    }
  ],
},
{
  key: "entrepreneurship",
  label: "Entrepreneurship",
  categories: [
    {
      key: "entrepreneurship-core",
      label: "Entrepreneurship core courses",
      courses: [
        "ENTR 310",
        "ENTR 445",
        "ENTR 454"
      ],
    },
    {
      key: "entrepreneurship-major-electives",
      label: "Entrepreneurship major electives",
      courses: [
        "ENTR 320",
        "ENTR 420",
        "ENTR 435",
        "ENTR 444",
        "FIN 445",
        "ENTR 494"
      ],
    },
    {
      key: "entrepreneurship-related-business",
      label: "Entrepreneurship related business electives",
      courses: [
        "ACTG 355",
        "MGMT 355",
        "MGMT 453",
        "MGMT 463",
        "MGMT 470",
        "MGMT 486",
        "MGMT 490",
        "MKTG 462",
        "MKTG 463",
        "MKTG 470",
        "MKTG 476",
        "MKTG 479"
      ],
    }
  ],
},
{
  key: "human-resource-management",
  label: "Human Resource Management",
  categories: [
    {
      key: "hrm-core",
      label: "Human Resource Management core courses",
      courses: [
        "MGMT 452",
        "MGMT 453",
        "MGMT 455"
      ],
    },
    {
      key: "hrm-major-electives",
      label: "Human Resource Management major electives",
      courses: [
        "MGMT 464",
        "MGMT 465",
        "MGMT 470",
        "MGMT 475",
        "MGMT 486"
      ],
    },
    {
      key: "hrm-advanced-management",
      label: "Additional advanced management courses",
      courses: [
        "MGMT 300",
        "MGMT 350",
        "MGMT 360",
        "MGMT 370",
        "MGMT 400",
        "MGMT 420",
        "MGMT 430",
        "MGMT 440",
        "MGMT 450",
        "MGMT 460",
        "MGMT 480",
        "MGMT 490"
      ],
    }
  ],
},
{
  key: "management",
  label: "Management",
  categories: [
    {
      key: "management-core",
      label: "Management core courses",
      courses: [
        "MGMT 445",
        "MGMT 452",
        "MGMT 453"
      ],
    },
    {
      key: "management-electives",
      label: "Management electives",
      courses: [
        "MGMT 300",
        "MGMT 310",
        "MGMT 320",
        "MGMT 330",
        "MGMT 340",
        "MGMT 350",
        "MGMT 360",
        "MGMT 370",
        "MGMT 400",
        "MGMT 410",
        "MGMT 420",
        "MGMT 430",
        "MGMT 440",
        "MGMT 450",
        "MGMT 460",
        "MGMT 470",
        "MGMT 475",
        "MGMT 480",
        "MGMT 486",
        "MGMT 490"
      ],
    },
    {
      key: "management-crosslisted",
      label: "Management cross listed course",
      courses: [
        "MGMT 447"
      ],
    }
  ],
},
{
  key: "marketing",
  label: "Marketing",
  categories: [
    {
      key: "marketing-core",
      label: "Marketing core courses",
      courses: [
        "MKTG 360",
        "MKTG 361",
        "MKTG 462"
      ],
    },
    {
      key: "marketing-electives",
      label: "Marketing electives",
      courses: [
        "MKTG 352",
        "MKTG 362",
        "MKTG 363",
        "MKTG 364",
        "MKTG 365",
        "MKTG 366",
        "MKTG 367",
        "MKTG 368",
        "MKTG 369",
        "MKTG 370",
        "MKTG 462",
        "MKTG 463",
        "MKTG 470",
        "MKTG 471",
        "MKTG 472",
        "MKTG 473",
        "MKTG 474",
        "MKTG 475",
        "MKTG 476",
        "MKTG 479"
      ],
    }
  ],
},
{
  key: "real-estate",
  label: "Real Estate",
  categories: [
    {
      key: "real-estate-core",
      label: "Real Estate core courses",
      courses: [
        "RES 250",
        "RES 420",
        "RES 450"
      ],
    },
    {
      key: "real-estate-electives",
      label: "Real Estate electives",
      courses: [
        "RES 300",
        "RES 310",
        "RES 320",
        "RES 330",
        "RES 340",
        "RES 350",
        "RES 360",
        "RES 370",
        "RES 380",
        "RES 390",
        "RES 400",
        "RES 410",
        "RES 430",
        "RES 440",
        "RES 460",
        "RES 470",
        "RES 480",
        "RES 490"
      ],
    },
    {
      key: "real-estate-related-finance",
      label: "Related finance courses",
      courses: [
        "FIN 300",
        "FIN 445"
      ],
    }
  ],
},
{
  key: "biomedical-engineering",
  label: "Biomedical Engineering",
  categories: [
    {
      key: "bme-core",
      label: "Biomedical Engineering core courses",
      courses: [
        "BME 101",
        "BME 102",
        "BME 205",
        "BME 240",
        "BME 250",
        "BME 310",
        "BME 325",
        "BME 332",
        "BME 333",
        "BME 339",
        "BME 396",
        "BME 397",
        "BME 399",
        "BME 460",
        "ECE 210",
        "CME 260",
        "CS 109"
      ],
    },
    {
      key: "bme-math-science",
      label: "Biomedical Engineering math and science requirements",
      courses: [
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "PHYS 141",
        "PHYS 142",
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220",
        "MATH 218",
        "BIOS 110",
        "BIOS 220",
        "BIOS 222",
        "BIOS 286",
        "BIOS 340",
        "CHEM 232"
      ],
    },
    {
      key: "bme-selectives",
      label: "Biomedical Engineering selective courses",
      courses: [
        "BME 402",
        "BME 403",
        "BME 408",
        "BME 410",
        "BME 421",
        "BME 455",
        "BME 475",
        "BME 480",
        "BME 423",
        "BME 456",
        "BME 476",
        "BME 481"
      ],
    }
  ],
},
{
  key: "chemical-engineering",
  label: "Chemical Engineering",
  categories: [
    {
      key: "chemical-engineering-core",
      label: "Chemical Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CHE 201",
        "CHE 205",
        "CHE 210",
        "CHE 230",
        "CHE 301",
        "CHE 311",
        "CHE 312",
        "CHE 313",
        "CHE 321",
        "CHE 341",
        "CHE 381",
        "CHE 382",
        "CHE 396",
        "CHE 397",
        "CHE 499",
        "CME 260",
        "ECE 210",
        "CS 109"
      ],
    },
    {
      key: "chemical-engineering-math-science",
      label: "Chemical Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220",
        "PHYS 141",
        "PHYS 142",
        "CHEM 122",
        "CHEM 123",
        "CHEM 116",
        "CHEM 124",
        "CHEM 125",
        "CHEM 118",
        "CHEM 222",
        "CHEM 232",
        "CHEM 233",
        "CHEM 234",
        "CHEM 342",
        "CHEM 314",
        "CHEM 452",
        "CHEM 402",
        "CHEM 444"
      ],
    },
    {
      key: "chemical-engineering-selectives",
      label: "Chemical Engineering selectives",
      courses: [
        "CHE 330",
        "CHEM 346"
      ],
    },
    {
      key: "chemical-engineering-technical-electives",
      label: "Chemical Engineering technical electives",
      courses: [
        "CHE 392",
        "CHE 413",
        "CHE 421",
        "CHE 422",
        "CHE 423",
        "CHE 425",
        "CHE 433",
        "CHE 438",
        "CHE 440",
        "CHE 441",
        "CHE 450",
        "CHE 451",
        "CHE 453",
        "CHE 454",
        "CHE 455",
        "CHE 456",
        "CHE 457",
        "CHE 494"
      ],
    }
  ],
},
{
  key: "civil-engineering",
  label: "Civil Engineering",
  categories: [
    {
      key: "civil-engineering-core",
      label: "Civil Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CS 109",
        "CME 197",
        "CME 201",
        "CME 203",
        "CME 205",
        "CME 211",
        "CME 260",
        "CME 290",
        "CME 300",
        "CME 301",
        "CME 302",
        "CME 310",
        "CME 311",
        "CME 315",
        "CME 322",
        "CME 396",
        "CME 402",
        "CME 405",
        "CME 497",
        "CME 207",
        "IE 201",
        "ME 210",
        "ME 250",
        "CME 297"
      ],
    },
    {
      key: "civil-engineering-math-science",
      label: "Civil Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220",
        "MATH 218",
        "STAT 381",
        "PHYS 141",
        "PHYS 142",
        "CHEM 122",
        "CHEM 123"
      ],
    },
    {
      key: "civil-engineering-technical-electives",
      label: "Civil Engineering technical electives",
      courses: [
        "CME 400",
        "CME 401",
        "CME 403",
        "CME 404",
        "CME 406",
        "CME 407",
        "CME 408",
        "CME 409",
        "CME 410",
        "CME 411",
        "CME 412",
        "CME 413",
        "CME 414",
        "CME 415",
        "CME 416",
        "CME 417",
        "CME 418",
        "CME 419",
        "CME 420",
        "CME 421",
        "CME 422",
        "CME 423",
        "CME 424",
        "CME 425",
        "CME 426",
        "CME 427",
        "CME 428",
        "CME 429",
        "CME 430",
        "CME 431",
        "CME 432",
        "CME 433",
        "CME 434",
        "CME 435",
        "CME 436",
        "CME 437",
        "CME 438",
        "CME 439",
        "CME 440",
        "CME 441",
        "CME 442",
        "CME 443",
        "CME 444",
        "CME 445",
        "CME 446",
        "CME 447",
        "CME 448",
        "CME 449",
        "CME 450",
        "CME 451",
        "CME 452",
        "CME 453",
        "CME 454",
        "CME 455",
        "CME 456",
        "CME 457",
        "CME 458",
        "CME 459",
        "CME 460",
        "CME 461",
        "CME 462",
        "CME 463",
        "CME 464",
        "CME 465",
        "CME 466",
        "CME 467",
        "CME 468",
        "CME 469",
        "CME 470",
        "CME 471",
        "CME 472",
        "CME 473",
        "CME 474",
        "CME 475",
        "CME 476",
        "CME 477",
        "CME 478",
        "CME 479",
        "CME 480",
        "CME 481",
        "CME 482",
        "CME 483",
        "CME 484",
        "CME 485",
        "CME 486",
        "CME 487",
        "CME 488",
        "CME 489",
        "CME 490",
        "CME 491",
        "CME 492",
        "CME 495"
      ],
    }
  ],
},
{
  key: "environmental-engineering",
  label: "Environmental Engineering",
  categories: [
    {
      key: "environmental-engineering-core",
      label: "Environmental Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CME 119",
        "CME 197",
        "CME 207",
        "CME 211",
        "CME 260",
        "CME 297",
        "CME 311",
        "CME 322",
        "CME 396",
        "CME 403",
        "CME 411",
        "CME 421",
        "CME 422",
        "CME 427",
        "CME 497",
        "CS 109",
        "CHE 210",
        "ME 205",
        "ME 450"
      ],
    },
    {
      key: "environmental-engineering-math-science",
      label: "Environmental Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 218",
        "STAT 381",
        "MATH 220",
        "PHYS 141",
        "PHYS 142",
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "EAES 101",
        "EAES 111"
      ],
    },
    {
      key: "environmental-engineering-technical-electives",
      label: "Environmental Engineering technical electives",
      courses: [
        "CME 400",
        "CME 401",
        "CME 402",
        "CME 404",
        "CME 405",
        "CME 406",
        "CME 407",
        "CME 408",
        "CME 409",
        "CME 410",
        "CME 412",
        "CME 413",
        "CME 414",
        "CME 415",
        "CME 416",
        "CME 417",
        "CME 418",
        "CME 419",
        "CME 420",
        "CME 423",
        "CME 424",
        "CME 425",
        "CME 426",
        "CME 428",
        "CME 429",
        "CME 430",
        "CME 431",
        "CME 432",
        "CME 433",
        "CME 434",
        "CME 435",
        "CME 436",
        "CME 437",
        "CME 438",
        "CME 439",
        "CME 440",
        "CME 441",
        "CME 442",
        "CME 443",
        "CME 444",
        "CME 445",
        "CME 446",
        "CME 447",
        "CME 448",
        "CME 449",
        "CME 450",
        "CME 451",
        "CME 452",
        "CME 453",
        "CME 454",
        "CME 455",
        "CME 456",
        "CME 457",
        "CME 458",
        "CME 459",
        "CME 460",
        "CME 461",
        "CME 462",
        "CME 463",
        "CME 464",
        "CME 465",
        "CME 466",
        "CME 467",
        "CME 468",
        "CME 469",
        "CME 470",
        "CME 471",
        "CME 472",
        "CME 473",
        "CME 474",
        "CME 475",
        "CME 476",
        "CME 477",
        "CME 478",
        "CME 479",
        "CME 480",
        "CME 481",
        "CME 482",
        "CME 483",
        "CME 484",
        "CME 485",
        "CME 486",
        "CME 487",
        "CME 488",
        "CME 489",
        "CME 490",
        "CME 491",
        "CME 492",
        "CME 495"
      ],
    }
  ],
},
{
  key: "computer-science-and-design",
  label: "Computer Science and Design",
  categories: [
    {
      key: "cs-design-cs-core",
      label: "Computer Science core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CS 111",
        "CS 112",
        "CS 113",
        "CS 141",
        "CS 151",
        "CS 211",
        "CS 251",
        "CS 401",
        "CS 427",
        "CS 261",
        "CS 301",
        "CS 341",
        "CS 342",
        "CS 361",
        "CS 362"
      ],
    },
    {
      key: "cs-design-cs-electives",
      label: "Computer Science technical electives",
      courses: [
        "CS 411",
        "CS 412",
        "CS 418",
        "CS 421",
        "CS 422",
        "CS 424",
        "CS 425",
        "CS 426",
        "CS 428",
        "CS 474",
        "CS 478",
        "CS 480",
        "CS 489"
      ],
    },
    {
      key: "cs-design-design-core",
      label: "Design core courses",
      courses: [
        "DES 150",
        "DES 160",
        "DES 170",
        "DES 208",
        "DES 209",
        "DES 255",
        "DES 256",
        "DES 357",
        "DES 458",
        "DES 420",
        "DES 421",
        "DES 430",
        "DES 431",
        "DES 452",
        "DES 453"
      ],
    },
    {
      key: "cs-design-foundations",
      label: "Computer Science and Design foundational courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "AH 110",
        "DES 236",
        "DES 355",
        "MATH 180",
        "MATH 181",
        "IE 342",
        "BIOS 110",
        "BIOS 120",
        "CHEM 122",
        "CHEM 123",
        "CHEM 116",
        "CHEM 124",
        "CHEM 125",
        "CHEM 118",
        "PHYS 141",
        "PHYS 142",
        "EAES 101",
        "EAES 111",
        "MATH 215",
        "MATH 220",
        "MATH 218",
        "MATH 320",
        "MATH 430",
        "MATH 435",
        "MATH 436",
        "MCS 421",
        "MCS 423",
        "MCS 471",
        "STAT 381",
        "STAT 401",
        "STAT 473"
      ],
    }
  ],
},
{
  key: "electrical-engineering",
  label: "Electrical Engineering",
  categories: [
    {
      key: "electrical-engineering-core",
      label: "Electrical Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CS 107",
        "ECE 115",
        "ECE 225",
        "ECE 265",
        "ECE 266",
        "ECE 310",
        "ECE 311",
        "ECE 317",
        "ECE 322",
        "ECE 340",
        "ECE 341",
        "ECE 342",
        "ECE 346",
        "ECE 350",
        "ECE 396",
        "ECE 397",
        "ECE 499"
      ],
    },
    {
      key: "electrical-engineering-math-science",
      label: "Electrical Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 218",
        "MATH 220",
        "PHYS 141",
        "PHYS 142",
        "PHYS 260",
        "CHEM 122",
        "CHEM 123"
      ],
    },
    {
      key: "electrical-engineering-technical-electives",
      label: "Electrical Engineering technical electives",
      courses: [
        "PHYS 240",
        "ECE 333",
        "ECE 347",
        "ECE 366",
        "ECE 407",
        "ECE 410",
        "ECE 412",
        "ECE 415",
        "ECE 417",
        "ECE 418",
        "ECE 421",
        "ECE 423",
        "ECE 424",
        "ECE 432",
        "ECE 434",
        "ECE 436",
        "ECE 437",
        "ECE 440",
        "ECE 442",
        "ECE 445",
        "ECE 448",
        "ECE 449",
        "ECE 451",
        "ECE 452",
        "ECE 454",
        "ECE 458",
        "ECE 464",
        "ECE 465",
        "ECE 466",
        "ECE 467",
        "ECE 468",
        "ECE 469",
        "MCS 425",
        "MCS 471",
        "STAT 471"
      ],
    }
  ],
},
{
  key: "computer-engineering",
  label: "Computer Engineering",
  categories: [
    {
      key: "computer-engineering-core",
      label: "Computer Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CS 107",
        "CS 151",
        "CS 251",
        "ECE 115",
        "ECE 225",
        "ECE 265",
        "ECE 266",
        "ECE 310",
        "ECE 333",
        "ECE 340",
        "ECE 341",
        "ECE 366",
        "ECE 396",
        "ECE 397",
        "ECE 465",
        "ECE 466",
        "ECE 467",
        "ECE 499"
      ],
    },
    {
      key: "computer-engineering-math-science",
      label: "Computer Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 218",
        "MATH 220",
        "PHYS 141",
        "PHYS 142",
        "PHYS 260",
        "CHEM 122",
        "CHEM 123"
      ],
    },
    {
      key: "computer-engineering-technical-electives",
      label: "Computer Engineering technical electives",
      courses: [
        "CS 361",
        "CS 401",
        "ECE 311",
        "ECE 317",
        "ECE 322",
        "ECE 342",
        "ECE 346",
        "ECE 347",
        "ECE 350",
        "ECE 407",
        "ECE 410",
        "ECE 412",
        "ECE 415",
        "ECE 417",
        "ECE 418",
        "ECE 421",
        "ECE 423",
        "ECE 424",
        "ECE 432",
        "ECE 434",
        "ECE 436",
        "ECE 437",
        "ECE 440",
        "ECE 442",
        "ECE 445",
        "ECE 448",
        "ECE 449",
        "ECE 451",
        "ECE 452",
        "ECE 454",
        "ECE 458",
        "ECE 464",
        "ECE 468",
        "ECE 469",
        "MCS 425",
        "MCS 471",
        "PHYS 240",
        "STAT 471"
      ],
    }
  ],
},
{
  key: "engineering-physics",
  label: "Engineering Physics",
  categories: [
    {
      key: "engineering-physics-core",
      label: "Engineering Physics core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CME 260",
        "CS 107",
        "ECE 115",
        "ECE 225",
        "ECE 310",
        "ECE 322",
        "ECE 346",
        "ECE 421",
        "ECE 440",
        "ECE 396",
        "ECE 397",
        "BME 450",
        "PHYS 450",
        "ME 211",
        "ECE 499"
      ],
    },
    {
      key: "engineering-physics-math-science",
      label: "Engineering Physics math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220",
        "PHYS 141",
        "PHYS 142",
        "PHYS 215",
        "PHYS 240",
        "PHYS 245",
        "PHYS 411",
        "PHYS 441",
        "PHYS 481",
        "PHYS 499",
        "CHEM 122",
        "CHEM 123"
      ],
    },
    {
      key: "engineering-physics-math-electives",
      label: "Engineering Physics mathematics related electives",
      courses: [
        "MATH 218",
        "MATH 417",
        "MATH 480",
        "MATH 481",
        "MCS 471",
        "ECE 341"
      ],
    }
  ],
},
{
  key: "mechanical-engineering",
  label: "Mechanical Engineering",
  categories: [
    {
      key: "mechanical-engineering-core",
      label: "Mechanical Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CME 201",
        "CME 203",
        "CS 109",
        "ECE 210",
        "IE 201",
        "ME 205",
        "ME 210",
        "ME 211",
        "ME 250",
        "ME 312",
        "ME 320",
        "ME 321",
        "ME 328",
        "ME 341",
        "IE 342",
        "ME 347",
        "ME 370",
        "ME 380",
        "ME 396",
        "ME 397",
        "ME 499"
      ],
    },
    {
      key: "mechanical-engineering-math-science",
      label: "Mechanical Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220",
        "MATH 218",
        "CHEM 122",
        "CHEM 123",
        "PHYS 141",
        "PHYS 142"
      ],
    },
    {
      key: "mechanical-engineering-technical-electives",
      label: "Mechanical Engineering technical electives",
      courses: [
        "ME 308",
        "ME 325",
        "ME 348",
        "ME 392",
        "ECE 458",
        "CME 434",
        "IE 411",
        "IE 412",
        "IE 441",
        "IE 442",
        "IE 446",
        "IE 481",
        "IE 494"
      ],
    }
  ],
},
{
  key: "industrial-engineering",
  label: "Industrial Engineering",
  categories: [
    {
      key: "industrial-engineering-core",
      label: "Industrial Engineering core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CME 201",
        "CME 203",
        "CS 109",
        "ECE 210",
        "IE 201",
        "IE 342",
        "IE 345",
        "IE 348",
        "IE 365",
        "IE 380",
        "IE 396",
        "IE 397",
        "IE 442",
        "IE 463",
        "IE 466",
        "IE 467",
        "IE 471",
        "IE 472",
        "ME 250",
        "IE 499"
      ],
    },
    {
      key: "industrial-engineering-math-science",
      label: "Industrial Engineering math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 218",
        "MATH 220",
        "CHEM 122",
        "CHEM 123",
        "PHYS 141",
        "PHYS 142",
        "STAT 362",
        "MGMT 340"
      ],
    },
    {
      key: "industrial-engineering-technical-electives",
      label: "Industrial Engineering technical electives",
      courses: [
        "IE 392",
        "ME 205",
        "ME 210",
        "ME 347",
        "ME 401",
        "ME 410",
        "ME 411",
        "ME 412",
        "ME 481",
        "ME 494"
      ],
    }
  ],
},
{
  key: "engineering-management",
  label: "Engineering Management",
  categories: [
    {
      key: "engineering-management-core",
      label: "Engineering Management core courses",
      courses: [
        "ENGR 100",
        "ENGR 101",
        "CME 201",
        "CME 203",
        "CS 109",
        "IE 201",
        "IE 342",
        "IE 345",
        "IE 365",
        "IE 380",
        "IE 442",
        "IE 446",
        "IE 461",
        "IE 463",
        "IE 466",
        "IE 467",
        "IE 471",
        "IE 472",
        "IE 473",
        "IE 499"
      ],
    },
    {
      key: "engineering-management-business-foundations",
      label: "Engineering Management business foundations",
      courses: [
        "ACTG 210",
        "ACTG 211",
        "ECON 120",
        "ECON 121",
        "FIN 300",
        "MGMT 340",
        "MGMT 350",
        "MGMT 495",
        "MKTG 360",
        "STAT 362"
      ],
    },
    {
      key: "engineering-management-math-science",
      label: "Engineering Management math and science requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 218",
        "CHEM 122",
        "CHEM 123",
        "PHYS 141",
        "PHYS 142"
      ],
    }
  ],
},
{
  key: "biochemistry",
  label: "Biochemistry",
  categories: [
    {
      key: "biochemistry-core",
      label: "Biochemistry core courses",
      courses: [
        "CHEM 232",
        "CHEM 233",
        "CHEM 234",
        "CHEM 452",
        "BIOS 452",
        "CHEM 454",
        "BIOS 454",
        "CHEM 455",
        "CHEM 314"
      ],
    },
    {
      key: "biochemistry-biology-requirements",
      label: "Biochemistry biology requirements",
      courses: [
        "BIOS 110",
        "BIOS 120",
        "BIOS 220"
      ],
    },
    {
      key: "biochemistry-chemistry-requirements",
      label: "Biochemistry chemistry requirements",
      courses: [
        "CHEM 116",
        "CHEM 118",
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "CHEM 222"
      ],
    },
    {
      key: "biochemistry-physical-chemistry",
      label: "Biochemistry physical chemistry sequence",
      courses: [
        "CHEM 342",
        "CHEM 343",
        "CHEM 346",
        "CHEM 340",
        "CHEM 344"
      ],
    },
    {
      key: "biochemistry-math-physics",
      label: "Biochemistry math and physics requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "PHYS 141",
        "PHYS 142",
        "PHYS 131",
        "PHYS 132"
      ],
    }
  ],
},
{
  key: "chemistry",
  label: "Chemistry",
  categories: [
    {
      key: "chemistry-core",
      label: "Chemistry core courses",
      courses: [
        "CHEM 232",
        "CHEM 233",
        "CHEM 234",
        "CHEM 235",
        "CHEM 314",
        "CHEM 342",
        "CHEM 343",
        "CHEM 346",
        "CHEM 402",
        "CHEM 421",
        "CHEM 452"
      ],
    },
    {
      key: "chemistry-general-chemistry-sequence",
      label: "Chemistry general chemistry sequence",
      courses: [
        "CHEM 116",
        "CHEM 118",
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "CHEM 222"
      ],
    },
    {
      key: "chemistry-advanced-lecture-options",
      label: "Chemistry advanced lecture options",
      courses: [
        "CHEM 414",
        "CHEM 432",
        "CHEM 444"
      ],
    },
    {
      key: "chemistry-advanced-lab-options",
      label: "Chemistry advanced laboratory options",
      courses: [
        "CHEM 415",
        "CHEM 455",
        "CHEM 499"
      ],
    },
    {
      key: "chemistry-math-physics-requirements",
      label: "Chemistry math and physics requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "PHYS 141",
        "PHYS 142"
      ],
    }
  ],
},
{
  key: "cs-linguistics",
  label: "Computer Science and Linguistics",
  categories: [
    {
      key: "cs-linguistics-cs-core",
      label: "Computer science core",
      courses: [
        "CS 111",
        "CS 112",
        "CS 113",
        "CS 141",
        "CS 151",
        "CS 211",
        "CS 251",
        "CS 421"
      ],
    },
    {
      key: "cs-linguistics-theory",
      label: "Theory requirement",
      courses: [
        "CS 301",
        "MCS 441"
      ],
    },
    {
      key: "cs-linguistics-cs-selectives",
      label: "Computer science selectives",
      courses: [
        "CS 342",
        "CS 401",
        "MCS 401",
        "CS 411",
        "CS 412",
        "CS 418",
        "CS 422"
      ],
    },
    {
      key: "cs-linguistics-linguistics-core",
      label: "Linguistics core",
      courses: [
        "LING 150",
        "LING 160",
        "LING 210",
        "LING 220",
        "LING 230"
      ],
    },
    {
      key: "cs-linguistics-linguistics-selectives",
      label: "Linguistics selectives",
      courses: [
        "LING 260",
        "LING 300",
        "LING 310",
        "LING 320",
        "LING 330",
        "CHIN 330",
        "LING 340",
        "LING 350",
        "LING 360",
        "LING 370",
        "LING 410",
        "LING 440",
        "LING 459",
        "LING 483",
        "LING 487",
        "PHIL 206",
        "SPAN 361",
        "SPAN 362",
        "SPAN 363",
        "SPAN 365"
      ],
    },
    {
      key: "cs-linguistics-math-stats",
      label: "Math and statistics requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "STAT 381"
      ],
    }
  ],
},
{
  key: "mathematics",
  label: "Mathematics",
  categories: [
    {
      key: "math-core",
      label: "Mathematics core courses",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 215",
        "MATH 300",
        "MATH 313",
        "MATH 320",
        "MATH 330"
      ],
    },
    {
      key: "math-recommended-advanced",
      label: "Recommended advanced mathematics electives",
      courses: [
        "MATH 414",
        "MATH 417",
        "MATH 430",
        "MATH 435",
        "MATH 445",
        "MATH 446",
        "MCS 421",
        "MCS 423",
        "STAT 401",
        "STAT 475"
      ],
    }
  ],
},
{
  key: "statistics",
  label: "Statistics",
  categories: [
    {
      key: "statistics-core",
      label: "Statistics core courses",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 300",
        "STAT 381",
        "STAT 382",
        "STAT 385",
        "STAT 401",
        "STAT 481"
      ],
    },
    {
      key: "statistics-theory-methods",
      label: "Statistical theory and methods concentration",
      courses: [
        "MATH 215",
        "MATH 218",
        "MATH 313",
        "STAT 402",
        "STAT 411",
        "STAT 425",
        "STAT 448",
        "STAT 461",
        "STAT 462",
        "STAT 463",
        "STAT 476",
        "STAT 478",
        "STAT 481",
        "STAT 482",
        "STAT 484"
      ],
    },
    {
      key: "statistics-applied",
      label: "Applied statistics concentration",
      courses: [
        "ACTG 315",
        "ACTG 326",
        "BIOS 220",
        "BIOS 330",
        "CS 418",
        "CS 412",
        "ECON 270",
        "ECON 475",
        "FIN 310",
        "IDS 410",
        "MKTG 462",
        "PSCH 343",
        "SOC 275"
      ],
    }
  ],
},
{
  key: "math-teaching",
  label: "Teaching of Mathematics",
  categories: [
    {
      key: "math-teaching-core",
      label: "Mathematics core courses",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 215",
        "MATH 300",
        "MATH 218",
        "MATH 320",
        "MATH 330",
        "MATH 313"
      ],
    },
    {
      key: "math-teaching-math-education",
      label: "Mathematics education courses",
      courses: [
        "MTHT 411",
        "MTHT 430",
        "MTHT 435",
        "MTHT 420"
      ],
    },
    {
      key: "math-teaching-teacher-licensure",
      label: "Teacher licensure requirements",
      courses: [
        "ED 200",
        "ED 210",
        "ED 425",
        "CI 414",
        "SPED 410",
        "MTHT 400",
        "MTHT 401",
        "MTHT 438",
        "MTHT 439"
      ],
    },
    {
      key: "math-teaching-stat-option",
      label: "Statistics option",
      courses: [
        "STAT 381"
      ],
    }
  ],
},
{
  key: "math-computer-science",
  label: "Mathematics and Computer Science",
  categories: [
    {
      key: "math-cs-core",
      label: "Mathematics and computer science core",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 215",
        "MATH 300",
        "MCS 160",
        "MCS 275",
        "MATH 218",
        "MATH 320",
        "MCS 320",
        "MCS 360"
      ],
    },
    {
      key: "math-cs-algorithms-theory",
      label: "Algorithms and theory concentration",
      courses: [
        "MCS 401",
        "MCS 421",
        "MCS 423",
        "MCS 425",
        "MCS 441",
        "MCS 481"
      ],
    },
    {
      key: "math-cs-computational",
      label: "Computational mathematics concentration",
      courses: [
        "MCS 471",
        "MCS 472",
        "MCS 481",
        "MATH 419",
        "MATH 480",
        "MATH 481",
        "STAT 451",
        "STAT 471"
      ],
    }
  ],
},
{
  key: "neuroscience",
  label: "Neuroscience",
  categories: [
    {
      key: "neuroscience-core",
      label: "Neuroscience core courses",
      courses: [
        "PSCH 100",
        "BIOS 220",
        "BIOS 222",
        "BIOS 286",
        "PSCH 262",
        "PSCH 242",
        "PSCH 343",
        "BIOS 484",
        "PSCH 484",
        "PHIL 484",
        "BIOS 485",
        "PSCH 485",
        "PHIL 485"
      ],
    },
    {
      key: "neuroscience-biology-chemistry",
      label: "Biology and chemistry requirements",
      courses: [
        "BIOS 110",
        "BIOS 120",
        "CHEM 116",
        "CHEM 118",
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "CHEM 230",
        "CHEM 232",
        "CHEM 233"
      ],
    },
    {
      key: "neuroscience-philosophy",
      label: "Philosophy requirements",
      courses: [
        "PHIL 202",
        "PHIL 201",
        "PHIL 203",
        "PHIL 204",
        "PHIL 401",
        "PHIL 402",
        "PHIL 403",
        "PHIL 404"
      ],
    },
    {
      key: "neuroscience-labs",
      label: "Neuroscience laboratory options",
      courses: [
        "BIOS 483",
        "BIOS 486",
        "BIOS 489",
        "BIOS 482",
        "PSCH 351",
        "PSCH 361",
        "PSCH 363",
        "PSCH 367",
        "BME 476"
      ],
    },
    {
      key: "neuroscience-math",
      label: "Math requirement",
      courses: [
        "MATH 170",
        "MATH 180"
      ],
    }
  ],
},
{
  key: "cs-philosophy",
  label: "Computer Science and Philosophy",
  categories: [
    {
      key: "cs-philosophy-cs-core",
      label: "Computer science core",
      courses: [
        "CS 111",
        "CS 112",
        "CS 113",
        "MCS 160",
        "CS 141",
        "CS 151",
        "CS 211",
        "CS 251",
        "CS 401"
      ],
    },
    {
      key: "cs-philosophy-theory",
      label: "Theory requirement",
      courses: [
        "CS 301",
        "MCS 441"
      ],
    },
    {
      key: "cs-philosophy-cs-electives",
      label: "Computer science selectives",
      courses: [
        "CS 261",
        "CS 341",
        "CS 342",
        "CS 351",
        "CS 361",
        "CS 378",
        "CS 402",
        "CS 407",
        "CS 411",
        "CS 415",
        "CS 418",
        "CS 421",
        "CS 422",
        "CS 424",
        "CS 425",
        "CS 426",
        "CS 427",
        "CS 428",
        "CS 453",
        "CS 474",
        "CS 475",
        "CS 478",
        "CS 480",
        "CS 489"
      ],
    },
    {
      key: "cs-philosophy-philosophy-core",
      label: "Philosophy core",
      courses: [
        "PHIL 210",
        "PHIL 215",
        "PHIL 300",
        "PHIL 315"
      ],
    },
    {
      key: "cs-philosophy-philosophy-electives",
      label: "Philosophy electives",
      courses: [
        "PHIL 230",
        "PHIL 231",
        "PHIL 232",
        "PHIL 432",
        "PHIL 433",
        "LING 350"
      ],
    },
    {
      key: "cs-philosophy-math-stats",
      label: "Math and statistics requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "STAT 381"
      ],
    }
  ],
},
{
  key: "physics",
  label: "Physics",
  categories: [
    {
      key: "physics-core",
      label: "Physics core courses",
      courses: [
        "PHYS 141",
        "PHYS 142",
        "PHYS 215",
        "PHYS 230",
        "PHYS 240",
        "PHYS 241",
        "PHYS 245",
        "PHYS 401",
        "PHYS 411",
        "PHYS 441",
        "PHYS 461",
        "PHYS 425",
        "PHYS 482",
        "PHYS 402",
        "PHYS 412",
        "PHYS 481",
        "PHYS 499"
      ],
    },
    {
      key: "physics-math-requirements",
      label: "Mathematics requirements",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220"
      ],
    },
    {
      key: "physics-chemistry-requirements",
      label: "Chemistry requirements",
      courses: [
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125"
      ],
    }
  ],
},
{
  key: "psychology",
  label: "Psychology",
  categories: [
    {
      key: "psychology-core",
      label: "Psychology core courses",
      courses: [
        "PSCH 100",
        "PSCH 242",
        "PSCH 343"
      ],
    },
    {
      key: "psychology-lab-options",
      label: "Psychology laboratory options (Writing in the Discipline)",
      courses: [
        "PSCH 313",
        "PSCH 321",
        "PSCH 331",
        "PSCH 333",
        "PSCH 351",
        "PSCH 353",
        "PSCH 361",
        "PSCH 363",
        "PSCH 367"
      ],
    },
    {
      key: "psychology-cognitive-neuro",
      label: "Cognitive and behavioral neuroscience options",
      courses: [
        "PSCH 262",
        "PSCH 350",
        "PSCH 351",
        "PSCH 352",
        "PSCH 353",
        "PSCH 360",
        "PSCH 361",
        "PSCH 363",
        "PSCH 366"
      ],
    },
    {
      key: "psychology-social-developmental",
      label: "Social and developmental psychology options",
      courses: [
        "PSCH 210",
        "PSCH 231",
        "PSCH 270",
        "PSCH 312",
        "PSCH 313",
        "PSCH 320",
        "PSCH 321",
        "PSCH 324",
        "PSCH 331"
      ],
    }
  ],
},
{
  key: "nursing",
  label: "Nursing (BSN)",
  categories: [
    {
      key: "nursing-prerequisites",
      label: "Pre-nursing prerequisite courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "BIOS 250",
        "CHEM 115",
        "KN 230",
        "KN 231",
        "KN 232",
        "KN 233",
        "NUEL 250",
        "HN 196",
        "STAT 101",
        "STAT 130"
      ],
    },
    {
      key: "nursing-core",
      label: "Core nursing courses",
      courses: [
        "NURS 228",
        "NURS 409",
        "NURS 411",
        "NURS 419",
        "NURS 420",
        "NURS 423",
        "NURS 433",
        "NURS 438",
        "NURS 443",
        "NURS 448",
        "NURS 453",
        "NURS 458",
        "NURS 463",
        "NURS 473"
      ],
    }
  ],
},
{
  key: "pharmaceutical-sciences",
  label: "Pharmaceutical Sciences",
  categories: [
    {
      key: "pharm-prerequisites",
      label: "Pre-pharmaceutical prerequisite courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "CHEM 116",
        "CHEM 118",
        "COMM 100",
        "COMM 102",
        "BIOS 110",
        "BIOS 120",
        "CHEM 232",
        "CHEM 233",
        "CHEM 234",
        "PHYS 118",
        "PHYS 131",
        "PHYS 141",
        "MATH 165",
        "MATH 170",
        "MATH 180",
        "STAT 101",
        "STAT 130"
      ],
    },
    {
      key: "pharm-core",
      label: "Pharmaceutical sciences core courses",
      courses: [
        "BIOS 350",
        "BIOS 351",
        "BIOS 352",
        "BIOS 452",
        "KN 230",
        "KN 231",
        "KN 232",
        "KN 233",
        "PSCI 300",
        "PSOP 300",
        "PMPR 300",
        "PHAR 200",
        "PHAR 201",
        "PHAR 410",
        "PHAR 422",
        "PHAR 423",
        "PHAR 431",
        "PHAR 432",
        "PHAR 435",
        "PHAR 438",
        "PHAR 461",
        "BIOS 220",
        "BIOS 416",
        "BIOS 450",
        "BIOS 458"
      ],
    }
  ],
},
{
  key: "public-health",
  label: "Public Health (BS)",
  categories: [
    {
      key: "public-health-prerequisites",
      label: "Public health prerequisite courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "PUBH 100",
        "PUBH 105",
        "PUBH 110",
        "PUBH 120",
        "BIOS 110",
        "BIOS 120",
        "STAT 101",
        "STAT 130"
      ],
    },
    {
      key: "public-health-core",
      label: "Public health core courses",
      courses: [
        "PUBH 300",
        "PUBH 301",
        "PUBH 310",
        "PUBH 320",
        "PUBH 330",
        "PUBH 340",
        "PUBH 350",
        "PUBH 360",
        "PUBH 370",
        "PUBH 395",
        "PUBH 397",
        "PUBH 410",
        "PUBH 411"
      ],
    }
  ],
},
{
  key: "architectural-studies",
  label: "Architectural Studies (BA)",
  categories: [
    {
      key: "architecture-prerequisites",
      label: "Pre-architectural studies courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "AH 110",
        "AH 111",
        "ARCH 200",
        "MATH 121"
      ],
    },
    {
      key: "architecture-core",
      label: "Architectural studies core courses",
      courses: [
        "ARCH 105",
        "ARCH 106",
        "ARCH 151",
        "ARCH 251",
        "ARCH 252",
        "ARCH 371",
        "ARCH 372",
        "ARCH 414",
        "ARCH 440",
        "ARCH 499"
      ],
    }
  ],
},
{
  key: "interdisciplinary-education-in-the-arts",
  label: "Interdisciplinary Education in the Arts (BA)",
  categories: [
    {
      key: "idea-core",
      label: "IDEA core courses",
      courses: [
        "IDEA 110",
        "IDEA 120",
        "DES 222",
        "IDEA 322",
        "IDEA 410",
        "ART 401",
        "ART 402",
        "DES 420",
        "DES 421",
        "DES 430",
        "DES 431",
        "DES 440",
        "DES 441",
        "DES 452",
        "DES 453"
      ],
    },
    {
      key: "idea-selectives",
      label: "IDEA major selectives",
      courses: [
        "AH 100",
        "AH 101",
        "AH 102",
        "AH 103",
        "AH 104",
        "AH 105",
        "AH 106",
        "AH 107",
        "AH 108",
        "AH 109",
        "AH 110",
        "AH 111",
        "AH 112",
        "AH 113",
        "AH 114",
        "AH 115",
        "AH 116",
        "AH 117",
        "AH 118",
        "AH 119",
        "AH 120",
        "AH 121",
        "AH 122",
        "AH 123",
        "AH 124",
        "AH 125",
        "AH 126",
        "AH 127",
        "AH 128",
        "AH 129",
        "AH 130",
        "AH 131",
        "AH 132",
        "AH 133",
        "AH 134",
        "AH 135",
        "AH 136",
        "AH 137",
        "AH 138",
        "AH 139",
        "AH 140",
        "AH 235",
        "DES 235",
        "AH 236",
        "DES 236",
        "ARCH 200",
        "ART 101",
        "ART 190",
        "IDEA 130",
        "MUS 100",
        "MUS 107",
        "THTR 101",
        "THTR 155"
      ],
    },
    {
      key: "idea-electives",
      label: "IDEA major electives",
      courses: [
        "ARCH 105",
        "ARCH 106",
        "ARCH 251",
        "ARCH 252",
        "AH 236",
        "DES 236",
        "IDEA 210",
        "IDEA 310",
        "ART 112",
        "ART 130",
        "ART 140",
        "ART 150",
        "ART 160",
        "ART 170",
        "DES 120",
        "DES 130",
        "DES 140",
        "DES 150",
        "DES 160",
        "DES 170",
        "MUS 113",
        "MUS 114",
        "MUS 115",
        "MUS 117",
        "MUS 118",
        "MUS 119",
        "MUS 127",
        "MUS 240",
        "THTR 150",
        "THTR 151"
      ],
    },
    {
      key: "idea-foundations",
      label: "Foundation courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "DLG 120",
        "ISA 100"
      ],
    }
  ],
},
{
  key: "art-history",
  label: "Art History (BA)",
  categories: [
    {
      key: "art-history-foundations",
      label: "Art History foundation courses",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "DLG 120"
      ],
    },
    {
      key: "art-history-introductory-study",
      label: "Art History introductory study",
      courses: [
        "AH 100",
        "AH 101",
        "AH 110",
        "AH 111",
        "AH 122",
        "AH 125",
        "AH 130",
        "AH 160",
        "AH 180"
      ],
    },
    {
      key: "art-history-methods-writing",
      label: "Art History methods and writing",
      courses: [
        "AH 301",
        "AH 303"
      ],
    },
    {
      key: "art-history-external-study",
      label: "Art History external study options",
      courses: [
        "AH 483",
        "AH 491",
        "AH 399"
      ],
    }
  ],
},
{
  key: "ba-design-studies",
  label: "BA in Design Studies",
  categories: [
    {
      key: "general-education-core",
      label: "General Education and Core Requirements",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "AH 110",
        "AH 111"
      ],
    },
    {
      key: "foundation-courses",
      label: "Foundation Course Requirements",
      courses: [
        "DES 110",
        "DES 140",
        "DES 150",
        "DES 160",
        "DES 170"
      ],
    },
    {
      key: "major-core",
      label: "Design Studies Major Requirements",
      courses: [
        "DES 208",
        "DES 209",
        "DES 222",
        "DES 235",
        "DES 236",
        "DES 255",
        "DES 256",
        "DES 322",
        "DES 355",
        "DES 357",
        "DES 458",
        "DES 410",
        "DES 411"
      ],
    },
    {
      key: "professional-practice-track",
      label: "Professional Practice Track Options",
      courses: [
        "DES 420",
        "DES 421",
        "DES 430",
        "DES 431",
        "DES 440",
        "DES 441",
        "DES 452",
        "DES 453"
      ],
    }
  ],
},
{
  key: "ba-music",
  label: "BA in Music",
  categories: [
    {
      key: "general-education-core",
      label: "General Education and Core Requirements",
      courses: [
        "ENGL 160",
        "ENGL 161"
      ],
    },
    {
      key: "music-theory-and-training",
      label: "Music Theory and Ear Training",
      courses: [
        "MUS 101",
        "MUS 102",
        "MUS 103",
        "MUS 104",
        "MUS 201",
        "MUS 202",
        "MUS 203",
        "MUS 204"
      ],
    },
    {
      key: "music-history-and-analysis",
      label: "Music History and Analysis",
      courses: [
        "MUS 230",
        "MUS 231",
        "MUS 232",
        "MUS 227",
        "MUS 301"
      ],
    },
    {
      key: "music-skills-and-technology",
      label: "Music Skills and Technology",
      courses: [
        "MUS 170",
        "MUS 171",
        "MUS 223"
      ],
    },
    {
      key: "performance-requirements",
      label: "Performance Requirements",
      courses: [
        "MUS 110",
        "MUS 111",
        "MUS 181",
        "MUS 183"
      ],
    },
    {
      key: "music-electives",
      label: "Music Electives",
      courses: [
        "MUS 113",
        "MUS 114",
        "MUS 115",
        "MUS 117",
        "MUS 118",
        "MUS 119",
        "MUS 127",
        "MUS 240"
      ],
    },
    {
      key: "advanced-music-electives",
      label: "Advanced Music Electives",
      courses: [
        "MUS 300",
        "MUS 302",
        "MUS 303",
        "MUS 304",
        "MUS 306",
        "MUS 307",
        "MUS 312",
        "MUS 330"
      ],
    },
    {
      key: "ensemble-requirement",
      label: "Ensemble Requirement",
      courses: [
        "MUS 150",
        "MUS 151",
        "MUS 152",
        "MUS 153",
        "MUS 154",
        "MUS 155",
        "MUS 157",
        "MUS 159",
        "MUS 160"
      ],
    },
    {
      key: "first-year-dialogue",
      label: "First-Year Dialogue Seminar",
      courses: [
        "DLG 120"
      ],
    }
  ],
},
{
  key: "ba-music-business",
  label: "BA in Music Business",
  categories: [
    {
      key: "general-and-basic-education",
      label: "General and Basic Education Requirements",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "MATH 125",
        "ECON 120",
        "ECON 121"
      ],
    },
    {
      key: "music-theory-and-training",
      label: "Music Theory and Ear Training",
      courses: [
        "MUS 101",
        "MUS 102",
        "MUS 201",
        "MUS 202",
        "MUS 103",
        "MUS 104",
        "MUS 203",
        "MUS 204"
      ],
    },
    {
      key: "music-core",
      label: "Music Course Requirements",
      courses: [
        "MUS 110",
        "MUS 111",
        "MUS 118",
        "MUS 170",
        "MUS 171",
        "MUS 191",
        "MUS 223",
        "MUS 230",
        "MUS 231",
        "MUS 232",
        "MUS 227",
        "MUS 390",
        "MUS 396",
        "MUS 397",
        "MUS 395"
      ],
    },
    {
      key: "music-selectives",
      label: "Music Selectives",
      courses: [
        "MUS 150",
        "MUS 151",
        "MUS 152",
        "MUS 153",
        "MUS 154",
        "MUS 155",
        "MUS 157",
        "MUS 159",
        "MUS 160",
        "MUS 181",
        "MUS 183"
      ],
    },
    {
      key: "business-core",
      label: "Business Course Requirements",
      courses: [
        "ACTG 210",
        "FIN 300",
        "FIN 301",
        "MKTG 360"
      ],
    },
    {
      key: "first-year-dialogue",
      label: "First-Year Dialogue Seminar",
      courses: [
        "DLG 120"
      ],
    }
  ],
},
{
  key: "ba-theatre-and-performance",
  label: "BA in Theatre and Performance",
  categories: [
    {
      key: "general-education-core",
      label: "General Education Requirements",
      courses: [
        "ENGL 160",
        "ENGL 161"
      ],
    },
    {
      key: "theatre-core",
      label: "Theatre Core Requirements",
      courses: [
        "THTR 101",
        "THTR 141",
        "THTR 182",
        "THTR 183",
        "THTR 201",
        "THTR 217",
        "THTR 230",
        "THTR 448"
      ],
    },
    {
      key: "track-requirements",
      label: "Track Requirements",
      courses: [
        "THTR 241",
        "THTR 317",
        "THTR 341",
        "THTR 449"
      ],
    },
    {
      key: "design-production-sequence",
      label: "Design, Production, and Technology Sequences",
      courses: [
        "THTR 150",
        "THTR 151",
        "THTR 152",
        "THTR 153",
        "THTR 155",
        "THTR 156",
        "THTR 158",
        "THTR 170",
        "THTR 250",
        "THTR 259"
      ],
    },
    {
      key: "authorship-selectives",
      label: "Authorship Selectives",
      courses: [
        "THTR 240",
        "THTR 331",
        "THTR 332",
        "THTR 333",
        "THTR 431",
        "THTR 435"
      ],
    },
    {
      key: "first-year-dialogue",
      label: "First-Year Dialogue Seminar",
      courses: [
        "DLG 120"
      ],
    }
  ],
},
{
  key: "ba-theatre-design-production-technology",
  label: "BA in Theatre Design, Production, and Technology",
  categories: [
    {
      key: "general-education-core",
      label: "General Education Requirements",
      courses: [
        "ENGL 160",
        "ENGL 161"
      ],
    },
    {
      key: "theatre-core",
      label: "Theatre Core Courses",
      courses: [
        "THTR 101",
        "THTR 141",
        "THTR 150",
        "THTR 155",
        "THTR 182",
        "THTR 183",
        "THTR 201",
        "THTR 230",
        "THTR 254"
      ],
    },
    {
      key: "design-production-required",
      label: "Design and Production Required Courses",
      courses: [
        "AH 111",
        "THTR 154",
        "THTR 157",
        "THTR 450"
      ],
    },
    {
      key: "design-production-selectives",
      label: "Design, Production, and Technology Selectives",
      courses: [
        "THTR 151",
        "THTR 152",
        "THTR 153",
        "THTR 156",
        "THTR 158",
        "THTR 170",
        "THTR 250",
        "THTR 251",
        "THTR 252",
        "THTR 253",
        "THTR 255",
        "THTR 256",
        "THTR 258",
        "THTR 259",
        "THTR 271",
        "THTR 351",
        "THTR 352",
        "THTR 353",
        "THTR 354",
        "THTR 355",
        "THTR 356"
      ],
    },
    {
      key: "theatre-practicum",
      label: "Theatre Practicum Courses",
      courses: [
        "THTR 281",
        "THTR 282",
        "THTR 283"
      ],
    },
    {
      key: "theatre-selective",
      label: "Theatre Selective",
      courses: [
        "THTR 333",
        "THTR 431",
        "THTR 435"
      ],
    },
    {
      key: "first-year-dialogue",
      label: "First-Year Dialogue Seminar",
      courses: [
        "DLG 120"
      ],
    }
  ],
},
{
  key: "bba-on-campus",
  label: "Bachelor of Business Administration (On-Campus)",
  categories: [
    {
      key: "prerequisites",
      label: "Prerequisite Core Courses",
      courses: [
        "ECON 120",
        "ECON 121"
      ],
    },
    {
      key: "business-core",
      label: "Business Core Courses",
      courses: [
        "ACTG 210",
        "ACTG 211",
        "BA 200",
        "FIN 300",
        "IDS 200",
        "IDS 270",
        "IDS 355",
        "MGMT 340",
        "MGMT 350",
        "MGMT 495",
        "MKTG 360",
        "ECON 220"
      ],
    }
  ],
},
{
  key: "ba-urban-education",
  label: "BA in Urban Education",
  categories: [
    {
      key: "core-curriculum",
      label: "Core Curriculum Requirements",
      courses: [
        "ENGL 160",
        "ENGL 161",
        "GEOG 161",
        "POLS 101",
        "HIST 103",
        "HIST 104",
        "NATS 105",
        "NATS 106",
        "MATH 140",
        "MATH 141",
        "ED 100",
        "ED 151",
        "ED 152",
        "ED 307",
        "ED 205",
        "EPSY 255",
        "EPSY 326",
        "EPSY 382"
      ],
    },
    {
      key: "elementary-education-major",
      label: "Elementary Education Course Requirements",
      courses: [
        "CI 401",
        "CI 402",
        "CI 403",
        "CI 404",
        "CI 405",
        "CI 406",
        "ED 316",
        "ED 317",
        "ED 350",
        "ED 351",
        "ED 416",
        "ED 417",
        "ED 450",
        "ED 451",
        "SPED 416",
        "CI 470"
      ],
    }
  ],
},
{
  key: "ba-human-development-and-learning",
  label: "BA in Human Development and Learning",
  categories: [
    {
      key: "general-education-core",
      label: "General Education Core and Elective Courses",
      courses: [
        "ENGL 160",
        "ENGL 161"
      ],
    },
    {
      key: "quantitative-reasoning",
      label: "Quantitative Reasoning Requirement",
      courses: [
        "MATH 105",
        "MATH 121",
        "MATH 140",
        "MATH 141",
        "MATH 160",
        "MATH 165",
        "MATH 180",
        "STAT 101",
        "PHIL 102",
        "PHIL 210"
      ],
    },
    {
      key: "hdl-core",
      label: "Human Development and Learning Core",
      courses: [
        "DLG 120",
        "ED 135",
        "EPSY 100",
        "EPSY 150",
        "EPSY 210",
        "EPSY 255",
        "EPSY 256",
        "EPSY 257"
      ],
    },
    {
      key: "research-core",
      label: "Research Core",
      courses: [
        "EPSY 363",
        "EPSY 373",
        "EPSY 405",
        "EPSY 416",
        "EPSY 450",
        "SPED 462"
      ],
    },
    {
      key: "domains-of-development-and-learning",
      label: "Domains of Development and Learning Across the Lifespan",
      courses: [
        "ED 421",
        "EPSY 429",
        "EPSY 320",
        "ED 424",
        "ED 258",
        "EPSY 466",
        "SPED 466",
        "EPSY 340",
        "EPSY 242",
        "EPSY 326",
        "EPSY 426"
      ],
    },
    {
      key: "diverse-populations-and-learning-contexts",
      label: "Diverse Populations and Learning Contexts",
      courses: [
        "ED 205",
        "ED 222",
        "EPSY 242",
        "EPSY 320",
        "EPSY 374",
        "EPSY 383",
        "EPSY 420",
        "EPSY 424",
        "SPED 466",
        "EPSY 466",
        "SPED 467",
        "ED 445",
        "EDPS 480",
        "EPSY 414",
        "EPSY 370",
        "EPSY 382",
        "EPSY 415",
        "SPED 461",
        "EPSY 371",
        "EPSY 471"
      ],
    },
    {
      key: "hdl-electives",
      label: "Human Development and Learning Electives",
      courses: [
        "EPSY 320",
        "EPSY 370",
        "EPSY 371",
        "EPSY 372",
        "EPSY 373",
        "EPSY 380",
        "EPSY 405",
        "EPSY 414",
        "EPSY 415",
        "EPSY 420",
        "EPSY 424",
        "EPSY 429",
        "ED 445",
        "EPSY 446",
        "EPSY 449",
        "SPED 449",
        "EPSY 482",
        "ED 421",
        "ED 422"
      ],
    }
  ],
},
{
  key: "ba-anthropology",
  label: "BA with a Major in Anthropology",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "ANTH 101",
        "ANTH 102",
        "ANTH 105",
        "ANTH 309"
      ],
    },
    {
      key: "anthropology-electives",
      label: "Anthropology Major Electives",
      courses: [
        "ANTH 100"
      ],
    }
  ],
},
{
  key: "ba-black-studies",
  label: "BA with a Major in Black Studies",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "BLST 100",
        "BLST 101",
        "BLST 206",
        "BLST 246",
        "BLST 401"
      ],
    },
    {
      key: "history-requirement",
      label: "History Requirement",
      courses: [
        "BLST 241",
        "BLST 242",
        "BLST 247",
        "BLST 248"
      ],
    },
    {
      key: "black-queer-and-feminist-studies",
      label: "Black Queer and Feminist Studies",
      courses: [
        "BLST 249",
        "BLST 261",
        "BLST 272",
        "BLST 294"
      ],
    },
    {
      key: "cultural-production-and-analysis",
      label: "Cultural Production and Analysis",
      courses: [
        "BLST 103",
        "BLST 104",
        "BLST 105",
        "BLST 110",
        "BLST 111",
        "BLST 247",
        "BLST 248",
        "BLST 249",
        "BLST 250",
        "BLST 261",
        "BLST 262",
        "BLST 264",
        "BLST 265",
        "BLST 266",
        "BLST 294"
      ],
    },
    {
      key: "diasporic-and-transnational-studies",
      label: "Diasporic and Transnational Studies",
      courses: [
        "BLST 110",
        "BLST 125",
        "BLST 191",
        "BLST 207",
        "BLST 210",
        "BLST 229",
        "BLST 266",
        "BLST 294"
      ],
    },
    {
      key: "race-politics-and-institutions",
      label: "Race, Politics, and Institutions",
      courses: [
        "BLST 103",
        "BLST 104",
        "BLST 105",
        "BLST 207",
        "BLST 225",
        "BLST 229",
        "BLST 247",
        "BLST 248",
        "BLST 249",
        "BLST 250",
        "BLST 258",
        "BLST 262",
        "BLST 271",
        "BLST 272",
        "BLST 294"
      ],
    },
    {
      key: "additional-black-studies-courses",
      label: "Additional Black Studies Courses",
      courses: [
        "BLST 300",
        "BLST 400"
      ],
    }
  ],
},
{
  key: "ba-chemistry",
  label: "BA with a Major in Chemistry",
  categories: [
    {
      key: "prerequisite-and-collateral-courses",
      label: "Prerequisite and Collateral Courses",
      courses: [
        "MATH 180",
        "MATH 181",
        "PHYS 141",
        "PHYS 142",
        "PHYS 131",
        "PHYS 132"
      ],
    },
    {
      key: "general-and-analytical-chemistry-sequence",
      label: "General and Analytical Chemistry Sequence",
      courses: [
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125",
        "CHEM 222",
        "CHEM 116",
        "CHEM 118"
      ],
    },
    {
      key: "organic-and-synthesis",
      label: "Organic and Synthesis Courses",
      courses: [
        "CHEM 232",
        "CHEM 233",
        "CHEM 234"
      ],
    },
    {
      key: "physical-chemistry-sequence",
      label: "Physical Chemistry Sequence",
      courses: [
        "CHEM 342",
        "CHEM 343",
        "CHEM 346",
        "CHEM 340",
        "CHEM 344"
      ],
    },
    {
      key: "inorganic-chemistry",
      label: "Inorganic Chemistry",
      courses: [
        "CHEM 314"
      ],
    },
    {
      key: "advanced-chemistry-electives",
      label: "Advanced Chemistry Electives",
      courses: [
        "CHEM 200"
      ],
    }
  ],
},
{
  key: "ba-classical-studies",
  label: "BA with a Major in Classical Studies",
  categories: [
    {
      key: "classics-core",
      label: "Classical Studies Core Requirements",
      courses: [
        "CL 102",
        "CL 208",
        "CL 103",
        "CL 204",
        "CL 205",
        "CL 100",
        "CL 202",
        "CL 101",
        "CL 203",
        "CL 398"
      ],
    },
    {
      key: "language-track",
      label: "Language Track Courses",
      courses: [
        "ARAB 104",
        "GKM 104",
        "LAT 104"
      ],
    },
    {
      key: "cross-listed-courses",
      label: "Cross-Listed Elective Courses",
      courses: [
        "HIST 202",
        "HIST 203",
        "HIST 401",
        "PHIL 120",
        "PHIL 220",
        "PHIL 221"
      ],
    }
  ],
},
{
  key: "ba-communication",
  label: "BA with a Major in Communication",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "COMM 101",
        "COMM 102",
        "COMM 103",
        "COMM 200",
        "COMM 301"
      ],
    },
    {
      key: "advanced-seminar",
      label: "Advanced Seminar Requirement",
      courses: [
        "COMM 490",
        "COMM 491"
      ],
    }
  ],
},
{
  key: "ba-criminology-law-and-justice",
  label: "BA with a Major in Criminology, Law, and Justice",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "CLJ 101",
        "CLJ 200",
        "CLJ 210",
        "CLJ 220",
        "CLJ 261",
        "CLJ 262"
      ],
    },
    {
      key: "area-elective",
      label: "Area Requirement",
      courses: [
        "CLJ 303",
        "CLJ 321",
        "CLJ 345",
        "CLJ 350",
        "CLJ 355",
        "CLJ 356",
        "CLJ 361",
        "CLJ 363"
      ],
    },
    {
      key: "advanced-writing",
      label: "Writing in the Discipline Options",
      courses: [
        "CLJ 405",
        "CLJ 422",
        "CLJ 423",
        "CLJ 424",
        "CLJ 425",
        "CLJ 430",
        "CLJ 435",
        "CLJ 442",
        "CLJ 450",
        "CLJ 491",
        "CLJ 492",
        "CLJ 493"
      ],
    }
  ],
},
{
  key: "ba-economics",
  label: "BA with a Major in Economics",
  categories: [
    {
      key: "prerequisites",
      label: "Prerequisite Courses",
      courses: [
        "MATH 121"
      ],
    },
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "ECON 120",
        "ECON 121",
        "ECON 220",
        "ECON 221",
        "ECON 270",
        "ECON 300",
        "ECON 400",
        "ECON 395"
      ],
    },
    {
      key: "major-electives",
      label: "Economics Electives",
      courses: [
        "ECON 213",
        "ECON 214",
        "ECON 215",
        "ECON 311",
        "ECON 328",
        "ECON 329",
        "ECON 330",
        "ECON 331",
        "ECON 332",
        "ECON 333",
        "ECON 334",
        "ECON 339",
        "ECON 344",
        "ECON 350",
        "ECON 370",
        "ECON 453",
        "ECON 475"
      ],
    }
  ],
},
{
  key: "ba-english",
  label: "BA with a Major in English",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "ENGL 207",
        "ENGL 208",
        "ENGL 209"
      ],
    },
    {
      key: "upper-level-writing",
      label: "Selective Upper-Level Writing Requirement",
      courses: [
        "ENGL 451",
        "ENGL 482",
        "ENGL 486",
        "ENGL 492",
        "ENGL 493",
        "ENGL 496",
        "ENGL 497"
      ],
    }
  ],
},
{
  key: "ba-teaching-of-english",
  label: "BA in the Teaching of English",
  categories: [
    {
      key: "core-requirements",
      label: "Core Requirements",
      courses: [
        "ENGL 207",
        "ENGL 208",
        "ENGL 209"
      ],
    },
    {
      key: "english-electives",
      label: "English Electives",
      courses: [
        "ENGL 153",
        "ENGL 213",
        "ENGL 236",
        "ENGL 237",
        "ENGL 238",
        "ENGL 258",
        "ENGL 282",
        "ENGL 313"
      ],
    },
    {
      key: "methods-courses",
      label: "Required Methods Courses",
      courses: [
        "ENGL 480",
        "ENGL 486",
        "ENGL 487",
        "ENGL 488"
      ],
    },
    {
      key: "collateral-courses",
      label: "Collateral Courses",
      courses: [
        "ENGL 498",
        "ENGL 499"
      ],
    },
    {
      key: "teacher-licensure",
      label: "Additional Requirements for Teacher Licensure",
      courses: [
        "ED 200",
        "ED 210",
        "ED 425",
        "SPED 410"
      ],
    }
  ],
},
{
  key: "ba-french-and-francophone-studies",
  label: "BA with a Major in French and Francophone Studies",
  categories: []
},
{
  key: "ba-gender-and-womens-studies",
  label: "BA with a Major in Gender and Women’s Studies",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "GWS 101",
        "GWS 102",
        "GWS 292",
        "GWS 390"
      ],
    },
    {
      key: "culture-and-representation",
      label: "Culture and Representation",
      courses: [
        "GWS 120",
        "GWS 192",
        "GWS 204",
        "GWS 211",
        "GWS 244",
        "GWS 245",
        "GWS 247",
        "GWS 255",
        "GWS 261",
        "GWS 272",
        "GWS 275",
        "GWS 276",
        "GWS 294",
        "GWS 304",
        "GWS 311",
        "GWS 344",
        "GWS 347",
        "GWS 406",
        "GWS 407",
        "GWS 439",
        "GWS 449",
        "GWS 458",
        "GWS 462",
        "GWS 469"
      ],
    },
    {
      key: "science-health-and-body",
      label: "Science, Health, and the Body",
      courses: [
        "GWS 205",
        "GWS 238",
        "GWS 262",
        "GWS 294",
        "GWS 315",
        "GWS 462"
      ],
    },
    {
      key: "feminism-social-policy-and-state",
      label: "Feminism, Social Policy, and the State",
      courses: [
        "GWS 202",
        "GWS 224",
        "GWS 232",
        "GWS 248",
        "GWS 259",
        "GWS 262",
        "GWS 275",
        "GWS 276",
        "GWS 294",
        "GWS 356",
        "GWS 406",
        "GWS 409",
        "GWS 424",
        "GWS 425",
        "GWS 428",
        "GWS 455",
        "GWS 462",
        "GWS 478",
        "GWS 484",
        "GWS 485"
      ],
    },
    {
      key: "sexuality-and-society",
      label: "Sexuality and Society",
      courses: [
        "GWS 203",
        "GWS 204",
        "GWS 211",
        "GWS 224",
        "GWS 232",
        "GWS 245",
        "GWS 252",
        "GWS 263",
        "GWS 272",
        "GWS 290",
        "GWS 294",
        "GWS 304",
        "GWS 311",
        "GWS 345",
        "GWS 347",
        "GWS 403",
        "GWS 407",
        "GWS 462",
        "GWS 484",
        "GWS 490"
      ],
    }
  ],
},
{
  key: "ba-germanic-studies",
  label: "BA with a Major in Germanic Studies",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "GER 211",
        "GER 212",
        "GER 300",
        "GER 401"
      ],
    },
    {
      key: "additional-germanic-studies-course",
      label: "Additional Germanic Studies Course",
      courses: [
        "GER 104"
      ],
    }
  ],
},
{
  key: "ba-teaching-of-german",
  label: "BA in the Teaching of German",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "GER 211",
        "GER 212",
        "GER 300",
        "GER 401"
      ],
    },
    {
      key: "teaching-methodology",
      label: "Teaching Methodology",
      courses: [
        "GER 448",
        "SPAN 448",
        "GER 449",
        "SPAN 449"
      ],
    },
    {
      key: "teacher-licensure",
      label: "Additional Requirements for Teacher Licensure",
      courses: [
        "ED 200",
        "ED 210",
        "ED 425",
        "SPED 410",
        "GER 494",
        "GER 495"
      ],
    }
  ],
},
{
  key: "ba-global-asian-studies",
  label: "BA with a Major in Global Asian Studies",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "GLAS 100",
        "GLAS 210",
        "GLAS 300"
      ],
    },
    {
      key: "empire-migration-diaspora",
      label: "Empire, Migration, and Diaspora",
      courses: [
        "GLAS 120",
        "GLAS 217",
        "GLAS 223",
        "GLAS 224",
        "GLAS 228",
        "GLAS 230",
        "GLAS 242",
        "GLAS 244",
        "GLAS 248",
        "GLAS 255",
        "GLAS 264",
        "GLAS 270",
        "GLAS 290",
        "GLAS 390",
        "GLAS 394",
        "GLAS 428",
        "GLAS 437",
        "GLAS 458",
        "GLAS 465",
        "GLAS 479",
        "GLAS 490",
        "GLAS 494"
      ],
    },
    {
      key: "culture-and-arts",
      label: "Culture and the Arts",
      courses: [
        "GLAS 105",
        "GLAS 123",
        "GLAS 125",
        "GLAS 209",
        "GLAS 219",
        "GLAS 220",
        "GLAS 223",
        "GLAS 229",
        "GLAS 230",
        "GLAS 263",
        "GLAS 270",
        "GLAS 278",
        "GLAS 290",
        "GLAS 328",
        "GLAS 390",
        "GLAS 394",
        "GLAS 441",
        "GLAS 463",
        "GLAS 471",
        "GLAS 490"
      ],
    },
    {
      key: "society-politics-state",
      label: "Society, Politics, and the State",
      courses: [
        "GLAS 109",
        "GLAS 120",
        "GLAS 200",
        "GLAS 201",
        "GLAS 207",
        "GLAS 228",
        "GLAS 231",
        "GLAS 232",
        "GLAS 250",
        "GLAS 270",
        "GLAS 271",
        "GLAS 272",
        "GLAS 275",
        "GLAS 276",
        "GLAS 279",
        "GLAS 290",
        "GLAS 390",
        "GLAS 394",
        "GLAS 428",
        "GLAS 438",
        "GLAS 458",
        "GLAS 465",
        "GLAS 473",
        "GLAS 479",
        "GLAS 490",
        "GLAS 494"
      ],
    }
  ],
},
{
  key: "ba-spanish",
  label: "BA with a Major in Spanish",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "SPAN 202",
        "SPAN 203",
        "SPAN 204",
        "SPAN 206",
        "SPAN 210",
        "SPAN 380"
      ],
    }
  ],
},
{
  key: "ba-teaching-of-spanish",
  label: "BA in the Teaching of Spanish",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "SPAN 202",
        "SPAN 203",
        "SPAN 204",
        "SPAN 206",
        "SPAN 210",
        "SPAN 302",
        "SPAN 380",
        "SPAN 448",
        "SPAN 449"
      ],
    },
    {
      key: "spanish-electives",
      label: "Spanish Electives",
      courses: [
        "SPAN 212"
      ],
    },
    {
      key: "teacher-licensure",
      label: "Additional Requirements for Teacher Licensure",
      courses: [
        "ED 200",
        "ED 210",
        "ED 425",
        "SPED 410",
        "SPAN 451",
        "SPAN 452"
      ],
    }
  ],
},
{
  key: "ba-history",
  label: "BA with a Major in History",
  categories: [
    {
      key: "required-core",
      label: "Core Requirements",
      courses: [
        "HIST 300",
        "HIST 440"
      ],
    },
    {
      key: "history-100-level",
      label: "100 Level History Courses",
      courses: [
        "HIST 100"
      ],
    },
    {
      key: "history-200-level",
      label: "200 Level History Courses",
      courses: [
        "HIST 200"
      ],
    },
    {
      key: "history-300-level",
      label: "300 Level History Courses",
      courses: [
        "HIST 300"
      ],
    },
    {
      key: "history-400-level",
      label: "400 Level History Courses",
      courses: [
        "HIST 440"
      ],
    }
  ],
},
{
  key: "ba-teaching-of-history",
  label: "BA in the Teaching of History",
  categories: [
    {
      key: "major-core",
      label: "Major Core Requirements",
      courses: [
        "HIST 106",
        "HIST 114",
        "HIST 100",
        "HIST 101",
        "HIST 103",
        "HIST 104",
        "HIST 255",
        "HIST 300",
        "HIST 320",
        "HIST 420",
        "HIST 440"
      ],
    },
    {
      key: "history-electives",
      label: "Additional History Requirements",
      courses: [
        "HIST 200",
        "HIST 400"
      ],
    },
    {
      key: "social-science-collateral",
      label: "Prerequisite and Collateral Social Science Courses",
      courses: [
        "ANTH 100",
        "GEOG 100",
        "ECON 100",
        "POLS 100",
        "PSCH 100",
        "SOC 100"
      ],
    },
    {
      key: "teacher-licensure",
      label: "Additional Requirements for Teacher Licensure",
      courses: [
        "ED 200",
        "ED 210",
        "SPED 410",
        "CI 414",
        "ED 425",
        "HIST 475",
        "HIST 476"
      ],
    }
  ],
},
{
  key: "ba-liberal-studies",
  label: "BA with a Major in Liberal Studies",
  categories: [
    {
      key: "career-preparation",
      label: "Career Exploration Requirement",
      courses: [
        "LAS 200",
        "LAS 289"
      ],
    }
  ],
},
{
  key: "ba-philosophy",
  label: "BA with a Major in Philosophy",
  categories: [
    {
      key: "core-requirements",
      label: "Core Requirements",
      courses: [
        "PHIL 102",
        "PHIL 300"
      ],
    },
    {
      key: "history-of-philosophy",
      label: "History of Philosophy",
      courses: [
        "PHIL 220",
        "PHIL 221",
        "PHIL 222",
        "PHIL 422",
        "PHIL 428",
        "PHIL 223",
        "PHIL 224",
        "PHIL 423",
        "PHIL 424",
        "PHIL 225",
        "PHIL 226",
        "PHIL 227",
        "PHIL 425",
        "PHIL 426",
        "PHIL 429"
      ],
    },
    {
      key: "philosophy-electives",
      label: "Philosophy Electives",
      courses: [
        "PHIL 201",
        "PHIL 202",
        "PHIL 203",
        "PHIL 204",
        "PHIL 206",
        "PHIL 210",
        "PHIL 211",
        "PHIL 215",
        "PHIL 226",
        "PHIL 227",
        "PHIL 240",
        "PHIL 241",
        "PHIL 401",
        "PHIL 402",
        "PHIL 403",
        "PHIL 404",
        "PHIL 406",
        "PHIL 410",
        "PHIL 426",
        "PHIL 427",
        "PHIL 441"
      ],
    },
    {
      key: "ethics-and-political-philosophy",
      label: "Ethics and Political Philosophy",
      courses: [
        "PHIL 230",
        "PHIL 231",
        "PHIL 232",
        "PHIL 234",
        "PHIL 315",
        "PHIL 357",
        "PHIL 432",
        "PHIL 433"
      ],
    }
  ],
},
{
  key: "ba-physics",
  label: "BA with a Major in Physics",
  categories: [
    {
      key: "prerequisites",
      label: "Prerequisite and Collateral Courses",
      courses: [
        "MATH 180",
        "MATH 181",
        "MATH 210",
        "MATH 220",
        "CHEM 122",
        "CHEM 123",
        "CHEM 124",
        "CHEM 125"
      ],
    },
    {
      key: "physics-core",
      label: "Physics Core Requirements",
      courses: [
        "PHYS 141",
        "PHYS 142",
        "PHYS 215",
        "PHYS 230",
        "PHYS 240",
        "PHYS 241",
        "PHYS 245",
        "PHYS 401",
        "PHYS 411",
        "PHYS 461",
        "PHYS 481",
        "PHYS 499"
      ],
    }
  ],
},
{
  key: "ba-political-science",
  label: "BA with a Major in Political Science",
  categories: [
    {
      key: "core-requirements",
      label: "Core Requirements",
      courses: [
        "POLS 101",
        "POLS 200"
      ],
    },
    {
      key: "foundations",
      label: "Foundational Political Science",
      courses: [
        "POLS 120",
        "POLS 130",
        "POLS 184"
      ],
    },
    {
      key: "seminar",
      label: "Advanced Seminar",
      courses: [
        "POLS 329",
        "POLS 349",
        "POLS 389",
        "POLS 399"
      ],
    }
  ],
},
{
  key: "ba-applied-psychology",
  label: "BA with a Major in Applied Psychology",
  categories: [
    {
      key: "core-requirements",
      label: "Core Requirements",
      courses: [
        "PSCH 100",
        "PSCH 242",
        "PSCH 340",
        "PSCH 343",
        "PSCH 385"
      ],
    },
    {
      key: "biological-and-cognitive",
      label: "Biological and Cognitive Psychology",
      courses: [
        "PSCH 262",
        "PSCH 350",
        "PSCH 351",
        "PSCH 352",
        "PSCH 353",
        "PSCH 360",
        "PSCH 361",
        "PSCH 363",
        "PSCH 366"
      ],
    },
    {
      key: "social-and-developmental",
      label: "Social and Developmental Psychology",
      courses: [
        "PSCH 210",
        "PSCH 231",
        "PSCH 270",
        "PSCH 312",
        "PSCH 313",
        "PSCH 320",
        "PSCH 321",
        "PSCH 324",
        "PSCH 331"
      ],
    },
    {
      key: "applied-practice",
      label: "Applied Practice",
      courses: [
        "PSCH 381",
        "PSCH 382",
        "PSCH 384"
      ],
    }
  ],
},
{
  key: "ba-sociology",
  label: "BA with a Major in Sociology",
  categories: [
    {
      key: "core-requirements",
      label: "Core Requirements",
      courses: [
        "SOC 100",
        "SOC 105",
        "SOC 201",
        "SOC 290",
        "SOC 300",
        "SOC 385",
        "SOC 490"
      ],
    },
    {
      key: "sociology-electives",
      label: "Sociology Electives",
      courses: [
        "SOC 296",
        "SOC 298",
        "SOC 496",
        "SOC 499"
      ],
    }
  ],
},
{
  key: "ba-public-policy",
  label: "BA in Public Policy",
  categories: [
    {
      key: "general-and-basic-education",
      label: "General and Basic Education Requirements",
      courses: [
        "UPA 120",
        "UPA 121",
        "ENGL 160",
        "ENGL 161",
        "MATH 110",
        "ECON 120"
      ],
    },
    {
      key: "core-program-requirements",
      label: "Core Program Requirements",
      courses: [
        "PPOL 100",
        "PPOL 105",
        "ECON 220",
        "US 240",
        "PPOL 205",
        "PPOL 210",
        "PPOL 303",
        "PPOL 305",
        "PPOL 405",
        "PPOL 491"
      ],
    },
    {
      key: "specialization-options",
      label: "Public Policy Specialization Options",
      courses: [
        "ECON 334",
        "ECON 342",
        "FIN 311",
        "ECON 311",
        "PPOL 212",
        "PPOL 232",
        "US 202",
        "US 240",
        "US 301",
        "ECON 214",
        "ED 200",
        "ED 252",
        "ED 402",
        "ED 403",
        "EDPS 412",
        "EAES 116",
        "LAS 493",
        "PA 494",
        "PPOL 240",
        "US 230",
        "UPP 403",
        "ECON 121",
        "ECON 221",
        "ECON 328",
        "FIN 250",
        "FIN 300",
        "PA 553",
        "POLS 211",
        "POLS 212",
        "POLS 228",
        "POLS 246",
        "PPOL 296",
        "PPOL 309",
        "ECON 215",
        "PUBH 310",
        "PUBH 330",
        "PUBH 350",
        "SOC 251",
        "MILS 217",
        "POLS 281",
        "POLS 284",
        "POLS 287",
        "POLS 384",
        "PPOL 231",
        "SJ 201",
        "SOC 225",
        "SOC 241",
        "SOC 265",
        "BLST 271",
        "SOC 271"
      ],
    }
  ],
},
{
  key: "ba-urban-studies",
  label: "BA in Urban Studies",
  categories: [
    {
      key: "required-courses",
      label: "Required Courses",
      courses: [
        "US 101",
        "US 130",
        "US 202",
        "US 240",
        "US 250",
        "US 301",
        "US 306",
        "US 308",
        "UPP 403",
        "UPP 405",
        "US 495"
      ],
    },
    {
      key: "concentration",
      label: "Concentration Requirement",
      courses: [
        "Urban Data Analytics (4 courses)",
        "Urban Environments and Climate Change (4 courses)",
        "City Design and Infrastructure (4 courses)",
        "Healthy Cities and Social Welfare (4 courses)",
        "Diverse and Just Cities (4 courses)",
        "Urban Economics (4 courses)",
        "Community Building and Organizing (4 courses)",
        "Urban Studies: Self-Designed (4 courses)"
      ],
    }
  ],
},
{
  key: "ba-public-health",
  label: "BA in Public Health",
  categories: [
    {
      key: "major-required-courses",
      label: "Major Required Courses",
      courses: [
        "PUBH 300",
        "PUBH 301",
        "PUBH 310",
        "PUBH 320",
        "PUBH 330",
        "PUBH 340",
        "PUBH 350",
        "PUBH 360",
        "PUBH 370",
        "PUBH 410",
        "PUBH 411",
        "PUBH 397"
      ],
    },
    {
      key: "selectives",
      label: "Public Health Selectives",
      courses: [
        "Public Health Selectives (18 hours)"
      ],
    }
  ],
}
];