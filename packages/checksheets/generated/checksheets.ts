// GENERATED FILE — DO NOT EDIT.
// Source:    packages/checksheets/data/*.template.json
// Generator: packages/checksheets/tools/generate.mjs
// Regenerate with: npm run gen -w packages/checksheets

export interface ChecksheetItem {
  ordinal: number;
  number: string | null;
  regulationRefs: readonly string[];
  /** Sparse: present only where the applicable regulations are class-scoped. */
  regulationRefsByClass?: Readonly<Record<string, readonly string[]>>;
  regulationRaw: string | null;
  guidanceUrl: string | null;
  action: string;
  records: string;
  evidenceRequired: boolean;
}

export interface ChecksheetSection {
  ordinal: number;
  number: string | null;
  title: string;
  items: readonly ChecksheetItem[];
}

export interface ChecksheetTemplate {
  code: string;
  title: string;
  psReference: string | null;
  classScope: readonly string[];
  revision: number;
  status: 'draft' | 'current' | 'superseded';
  sections: readonly ChecksheetSection[];
}

export const CHECKSHEET_TEMPLATES: readonly ChecksheetTemplate[] = [
  {
    "code": "wks17-class-2-and-3-1-substances",
    "title": "Check sheet Location Class 2 and 3.1 substances substances",
    "psReference": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard",
    "classScope": [],
    "revision": 1,
    "status": "draft",
    "sections": [
      {
        "ordinal": 1,
        "number": "Requirements specific to class 2 and 3.1 substances",
        "title": "Requirements specific to class 2 and 3.1 substances",
        "items": []
      },
      {
        "ordinal": 2,
        "number": "1 Class 2 and 3.1 substances to be secured",
        "title": "Class 2 and 3.1 substances to be secured",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "10.4(1)"
            ],
            "regulationRaw": "10.4(1)",
            "guidanceUrl": null,
            "action": "Determine whether the substances must be secured Verify that the requirements relating to security are met",
            "records": "A record of the quantities present, as compared to the threshold quantities A record of the means by which the substances are secured",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 3,
        "number": "2 Class 2 and 3.1 substances to be segregated from incompatible substances",
        "title": "Class 2 and 3.1 substances to be segregated from incompatible substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "10.5"
            ],
            "regulationRaw": "10.5",
            "guidanceUrl": null,
            "action": "Verify that incompatible substances are segregated",
            "records": "A record identifying the incompatible substances and the means of segregation",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 4,
        "number": "3 Hazardous areas for class 2.1.1, 2.1.2, 3.1A, 3.1B, or 3.1.C substances",
        "title": "Hazardous areas for class 2.1.1, 2.1.2, 3.1A, 3.1B, or 3.1.C substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "10.6(1)(a)"
            ],
            "regulationRaw": "10.6(1)(a))",
            "guidanceUrl": null,
            "action": "Verify whether the hazardous area is delineated in accordance with AS/NZS 60079.10.1:2009",
            "records": "A note as to whether the hazardous area is compliant",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "10.26(4)(b)"
            ],
            "regulationRaw": "10.26(4)(b)",
            "guidanceUrl": null,
            "action": "Verify that— (a) the hazardous substances are not in contact with incompatible substances; and (b) containers of incompatible substances are stored separately",
            "records": "Verify that the hazardous area is delineated, classified, and depicted on a site plan Verify sample elements of the plan to ensure it is correct",
            "evidenceRequired": true
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "10.26(4)(c)"
            ],
            "regulationRaw": "10.26(4)(c)",
            "guidanceUrl": null,
            "action": "Verify that the hazardous area is maintained",
            "records": "A reference to the electrical dossier A copy (or date and identifier) of electrical certificate(s) A note or record of representative samples of procedures and/or equipment",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 5,
        "number": "4 Separation of class 2.1.1 permanent gases",
        "title": "Separation of class 2.1.1 permanent gases",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.19(2)"
            ],
            "regulationRaw": "11.19(2)",
            "guidanceUrl": null,
            "action": "Verify that the prescribed separation distance between the vehicle fill points and storage of permanent gas is met",
            "records": "A record that confirms the minimum distance is complied with",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "11.19(3)"
            ],
            "regulationRaw": "11.19(3)",
            "guidanceUrl": null,
            "action": "Verify that the prescribed separation distances are met",
            "records": "A record that confirms the minimum distances are complied with",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "11.19(5)"
            ],
            "regulationRaw": "11.19(5)",
            "guidanceUrl": null,
            "action": "Verify that the prescribed separation distances are met",
            "records": "A record that confirms the minimum distances are complied with",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 6,
        "number": "Separation of class 2.1.1 liquefiable gases: cylinders",
        "title": "Separation of class 2.1.1 liquefiable gases: cylinders",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.2"
            ],
            "regulationRaw": "11.2",
            "guidanceUrl": null,
            "action": "Determine which subclause(s) (if any) of regulation 11.20 apply to the hazardous substance location",
            "records": "A record of the determination and the quantities of class 2.1.1 liquefiable gas present",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "11.20(1)"
            ],
            "regulationRaw": "11.20(1)",
            "guidanceUrl": null,
            "action": "Verify that the separation distances are met",
            "records": "A record of the basis for the verification",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "11.20(2)"
            ],
            "regulationRaw": "11.20(2)",
            "guidanceUrl": null,
            "action": "Verify that if the cylinders contain up to 100 kg, the requirements relating to the proximity of buildings and openings are met",
            "records": "A record of the basis for the verification",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "11.20(3)"
            ],
            "regulationRaw": "11.20(3)",
            "guidanceUrl": null,
            "action": "Verify that the cylinders are not located within 1 m of an opening to a drain",
            "records": "A record of the basis for the verification",
            "evidenceRequired": false
          },
          {
            "ordinal": 5,
            "number": "5",
            "regulationRefs": [
              "11.20(4)"
            ],
            "regulationRaw": "11.20(4)",
            "guidanceUrl": null,
            "action": "Verify that if the cylinders contain more than 100 kg and up to 300 kg, the requirements relating to the proximity of buildings and openings are met",
            "records": "A record of the basis of the verification, including the nature of fire-resistant materials, separation distance, and openings",
            "evidenceRequired": false
          },
          {
            "ordinal": 6,
            "number": "6",
            "regulationRefs": [
              "11.20(5)"
            ],
            "regulationRaw": "11.20(5)",
            "guidanceUrl": null,
            "action": "Verify that if the cylinders contain more than 300 kg and up to 1000 kg, the requirements relating to the proximity of buildings and openings are met and the wall of the building is vapour tight",
            "records": "A record of the basis of the verification, including the nature of the FRR materials, separation distance, and openings",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 7,
        "number": "Separation of class 2.1.1 liquefiable gases: cylinder filling",
        "title": "Separation of class 2.1.1 liquefiable gases: cylinder filling",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.22(1)"
            ],
            "regulationRaw": "11.22(1)",
            "guidanceUrl": null,
            "action": "Verify that the separation distances are met for the cylinder filling station",
            "records": "A record of the following: (a) the quantity of liquefiable gas at the hazardous substance location: (b) confirmation that the relevant minimum prescribed distance is met: (c) the point on the cylinder filling station that the separation distance is measure from",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 8,
        "number": "Separation of class 2.1.2 aerosols",
        "title": "Separation of class 2.1.2 aerosols",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.8"
            ],
            "regulationRaw": "11.8",
            "guidanceUrl": null,
            "action": "Establish the quantity of aerosols present and",
            "records": "A record of the quantities and separation distances",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "1",
            "regulationRefs": [
              "11.23"
            ],
            "regulationRaw": "11.23",
            "guidanceUrl": null,
            "action": "Confirm the aggregate water capacity exceeds 3,000 L Determine the nature of any neighbouring property and verify the separation distance Determine which subclauses apply",
            "records": "A record of the quantities and separation distances",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 9,
        "number": "Hazardous substance location holding not more than 10,000 L aggregate water capacity",
        "title": "Hazardous substance location holding not more than 10,000 L aggregate water capacity",
        "items": [
          {
            "ordinal": 1,
            "number": "2",
            "regulationRefs": [
              "11.24(1)(a)",
              "11.24(1)(b)"
            ],
            "regulationRaw": "11.24(1)(a) 11.24(1)(b)",
            "guidanceUrl": null,
            "action": "Verify the construction details of the room or building including details of the walls, ceiling, doors, and fittings as well as the fire protection",
            "records": "Records of the building layout, building construction, FRR, and building elements including suppliers' tags for doors and windows",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "3",
            "regulationRefs": [
              "11.24(1)(c)",
              "11.24(1)(d)"
            ],
            "regulationRaw": "11.24(1)(c) 11.24(1)(d)",
            "guidanceUrl": null,
            "action": "Verify that the general purpose warehouse used for receiving, storing, and distributing mixed goods (including flammable aerosols)— (a) is not a warehouse for the primary purpose of storing hazardous substances; and (b) is not accessible by the general public; and (c) has the flammable aerosols in the warehouse separated from the rest of the warehouse in accordance with the prescribed requirements and has prescribed fire protection",
            "records": "Records of the building layout, building construction, FRR, and building elements including suppliers' tags for doors and windows",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 10,
        "number": "Hazardous substance location holding more than 10,000 L but not more than 100,000 L aggregate water capacity of flammable aerosols",
        "title": "Hazardous substance location holding more than 10,000 L but not more than 100,000 L aggregate water capacity of flammable aerosols",
        "items": [
          {
            "ordinal": 1,
            "number": "4",
            "regulationRefs": [
              "11.25(1)(a)",
              "11.25(1)(b)"
            ],
            "regulationRaw": "11.25(1)(a) 11.25(1)(b)",
            "guidanceUrl": null,
            "action": "Verify the construction details and the fire protection of the building or the room",
            "records": "Records of the building layout, building construction, FRR, building details, and fire protection A record of building details is to include a record of tags of the building elements",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "5",
            "regulationRefs": [
              "11.25(1)(c)",
              "11.25(1)(d)"
            ],
            "regulationRaw": "11.25(1)(c) 11.25(1)(d)",
            "guidanceUrl": null,
            "action": "Verify the location that is in a general purpose warehouse for receiving, storing, and distributing mixed goods (including flammable aerosols)— (a) is not a warehouse for the primary purpose of storing hazardous substances; and (b) is not accessible by the general public Verify the construction details and the fire protection of the building or the room",
            "records": "A record confirming that the warehouse is a general purpose warehouse and is not accessible by the public Records of the building layout, building construction, FRR, building details, and fire protection A record of building details is to include a record of tags of the building elements",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "6",
            "regulationRefs": [
              "11.26(a)",
              "11.26(b)"
            ],
            "regulationRaw": "11.26(a) 11.26(b)",
            "guidanceUrl": null,
            "action": "Verify the construction details and the fire protection of the building or the room",
            "records": "A record confirming that the warehouse is a general purpose warehouse and is not accessible by the public Records of the building layout, building construction, FRR,building details, and fire protection A record of building details is to include a record of tags of the building elements",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "7",
            "regulationRefs": [
              "11.26(c)",
              "11.26(d)"
            ],
            "regulationRaw": "11.26(c) 11.26(d)",
            "guidanceUrl": null,
            "action": "Verify that the location— (a) is in a general purpose warehouse used for receiving, storing, and distributing mixed goods (including flammable aerosols); and (b) is not a warehouse for the primary purpose of storing hazardous substances; and (c) is not accessible by the general public Verify the flammable aerosols in the warehouse are separated from the rest of the warehouse Verify the construction details and the fire protection of the building or the room",
            "records": "A record confirming that the warehouse is a general purpose warehouse and is not accessible by the public Records of the building layout, building construction, FRR, building details, and fire protection A record of building details is to include a record of tags of the building elements",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 11,
        "number": "Separation of class 3.1 substances: transfer points to protected places",
        "title": "Separation of class 3.1 substances: transfer points to protected places",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.35"
            ],
            "regulationRaw": "11.35",
            "guidanceUrl": null,
            "action": "Verify that the separation distance to a protected place is met",
            "records": "A record that includes— (a) the substances contained; and (b) confirmation that the prescribed separation distance is met; and (c) the type of transfer point",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 12,
        "number": "Class 3.1 substances to be held in buildings of a certain type",
        "title": "Class 3.1 substances to be held in buildings of a certain type",
        "items": []
      },
      {
        "ordinal": 13,
        "number": "Storage Cabinet",
        "title": "Storage Cabinet",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.29(3)"
            ],
            "regulationRaw": "11.29(3)",
            "guidanceUrl": null,
            "action": "Verify— (a) the quantity of substances and their hazard classifications; and (b) the standard to which the cabinet is constructed; and (c) where more than one cabinet is located within a building, the aggregate capacity of the cabinets and the separation of the cabinets; and (d) for AS 1940 cabinets, the exclusion of sources of ignition around the cabinet",
            "records": "A record of— (a) the plate on the cabinet or the standard the cabinet is constructed to; and (b) the location of the cabinet; and (c) the separation distance between the cabinets (if applicable); and (d) exclusion of ignition sources",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 14,
        "number": "Building types A, B, C, and D storage",
        "title": "Building types A, B, C, and D storage",
        "items": [
          {
            "ordinal": 1,
            "number": "2",
            "regulationRefs": [
              "11.29(2)"
            ],
            "regulationRaw": "11.29(2)",
            "guidanceUrl": null,
            "action": "Verify— (a) the building type; and (b) compliance with the building type in all aspects i.e. walls, roof, doors, and windows; and (c) the classification of the substance; and (d) the package sizes; and (e) the prescribed separation distances; and (f) the actual separation distances",
            "records": "A record of— (a) the quantity and hazard classes of the substances stored; and (b) the building type; and (c) the details of the FRR building elements, including suppliers' tags for doors and windows; and (d) the actual separation distances",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 15,
        "number": "Storage of packages holding up to 60 litres of class 3.1 substances: separation from protected place",
        "title": "Storage of packages holding up to 60 litres of class 3.1 substances: separation from protected place",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.3"
            ],
            "regulationRaw": "11.3",
            "guidanceUrl": null,
            "action": "Verify that the separation distance to a protected place is met",
            "records": "A record that includes— (a) the substances contained; and (b) confirmation that the prescribed separation distance is met",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 16,
        "number": "Storage of packages holding class 3.1 substances in stores inside buildings",
        "title": "Storage of packages holding class 3.1 substances in stores inside buildings",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.31"
            ],
            "regulationRaw": "11.31",
            "guidanceUrl": null,
            "action": "Determine which provisions of regulation 11.31 apply",
            "records": "A record of the determination and the quantities of class 3 substances present",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "11.31(1)(a)"
            ],
            "regulationRaw": "11.31(1)(a)",
            "guidanceUrl": null,
            "action": "Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building, including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations; and (d) if applicable, the requirements for when a door is opening into a building",
            "records": "A record of— (a) the quantity of flammable substances; and (b) the FRR elements, including suppliers' tags for doors and windows; and (c) details of compliance with prescribed requirements for a door opening into a building",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "11.31(1)(b)"
            ],
            "regulationRaw": "11.31(1)(b)",
            "guidanceUrl": null,
            "action": "Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations; and (d) if applicable, the requirements for when a door is opening into a building",
            "records": "A record of— (a) the quantity of flammable substances; and (b) the FRR elements, including suppliers' tags for doors and windows; and (c) details of compliance with prescribed requirements for a door opening into a building",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "11.31(1)(c)"
            ],
            "regulationRaw": "11.31(1)(c)",
            "guidanceUrl": null,
            "action": "Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations; and (d) if applicable, the requirements for when a door is opening into a building",
            "records": "A record of— (a) the quantity of flammable substances; and (b) the FRR elements, including suppliers' tags for doors and windows; and (c) details of compliance with prescribed requirements for a door opening into a building",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 17,
        "number": "Type D storage with more than two walls in common with another building",
        "title": "Type D storage with more than two walls in common with another building",
        "items": [
          {
            "ordinal": 1,
            "number": "5",
            "regulationRefs": [
              "11.31(3)"
            ],
            "regulationRaw": "11.31(3)",
            "guidanceUrl": null,
            "action": "Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations",
            "records": "A record of— (a) the quantity of flammable substances and package sizes; and (b) the FRR elements, including suppliers' tags for doors and windows",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 18,
        "number": "Storage of packages holding more than 60 litres of class 3.1 substances: separation from protected place",
        "title": "Storage of packages holding more than 60 litres of class 3.1 substances: separation from protected place",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.34"
            ],
            "regulationRaw": "11.34",
            "guidanceUrl": null,
            "action": "Verify that the separation distance to a protected place is met",
            "records": "A record that includes— (a) the substances contained; and (b) confirmation that the prescribed separation distance is met",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 19,
        "number": "Class 3.1 substances used or in open packages or containers to be held in buildings of a certain type",
        "title": "Class 3.1 substances used or in open packages or containers to be held in buildings of a certain type",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.36"
            ],
            "regulationRaw": "11.36",
            "guidanceUrl": null,
            "action": "Verify the building type and the construction details of the building Determine which regulations apply",
            "records": "A record of— (a) the building FRR details including suppliers' tags for doors and windows; or (b) details of compliance with AS/NZS 4114.1:2003 e.g. a record of the plate or the supplier's verification",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 20,
        "number": "Type 1 workroom or a paint mixing room",
        "title": "Type 1 workroom or a paint mixing room",
        "items": [
          {
            "ordinal": 1,
            "number": "2",
            "regulationRefs": [
              "11.37(2)(a)"
            ],
            "regulationRaw": "11.37(2)(a)",
            "guidanceUrl": null,
            "action": "Verify— (a) that the workroom/paint mixing room holds no more than the prescribed quantity or container size; and (b) the location of the building",
            "records": "A record of container sizes, aggregate quantities, and the location of the building",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 21,
        "number": "Type 2 or Type 3 workroom",
        "title": "Type 2 or Type 3 workroom",
        "items": [
          {
            "ordinal": 1,
            "number": "3",
            "regulationRefs": [
              "11.37(2)(b)"
            ],
            "regulationRaw": "11.37(2)(b)",
            "guidanceUrl": null,
            "action": "Verify that the building holds no more than the prescribed quantity",
            "records": "A record of hazardous substance classes and aggregate quantities",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "4",
            "regulationRefs": [
              "11.37(4)"
            ],
            "regulationRaw": "11.37(4)",
            "guidanceUrl": null,
            "action": "Verify that the separation distances meet or exceed the prescribed separation distances",
            "records": "A record of the actual and prescribed separation distances",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 22,
        "number": "Other building type - regulation 11.37(5)",
        "title": "Other building type - regulation 11.37(5)",
        "items": [
          {
            "ordinal": 1,
            "number": "5",
            "regulationRefs": [
              "11.37(5)"
            ],
            "regulationRaw": "11.37(5)",
            "guidanceUrl": null,
            "action": "Verify— (a) the quantity of hazardous substances; and (b) that the quantity of class 3.1 substances is not more than the specified maximum; and (c) the occupancy of the building; and (d) the construction details of that part of the building; and (e) the controls on prohibiting ignition sources",
            "records": "A record of— (a) the quantities; and (b) the building details in the vicinity of the flammable substances; and (c) the occupational details of the building",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 23,
        "number": "Storage of packages holding class 3.1A, 3.1B, or 3.1C substances in retail stores",
        "title": "Storage of packages holding class 3.1A, 3.1B, or 3.1C substances in retail stores",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.32(1)",
              "11.33(1)"
            ],
            "regulationRaw": "11.32(1) 11.33(1)",
            "guidanceUrl": null,
            "action": "Determine whether regulation 11.32 or 11.33 applies",
            "records": "A record of the business type and container details",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "11.32(1)(b)"
            ],
            "regulationRaw": "11.32(1)(b)",
            "guidanceUrl": null,
            "action": "Verify that the quantities of class 3.1 substances are not more than the maximum",
            "records": "A record of the quantities",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "11.33(2)(b)"
            ],
            "regulationRaw": "11.33(2)(b)",
            "guidanceUrl": null,
            "action": "Verify that requirements for separation are compliant",
            "records": "A record of the separation details",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "11.33(2)(c)"
            ],
            "regulationRaw": "11.33(2)(c)",
            "guidanceUrl": null,
            "action": "Verify that the retail store complies with section 3.4 (General Requirements for Retail Storage) of AS/NZS 3833:2007",
            "records": "A record of the building elements",
            "evidenceRequired": false
          },
          {
            "ordinal": 5,
            "number": "5",
            "regulationRefs": [
              "11.33(1)(d)",
              "11.33(1)"
            ],
            "regulationRaw": "11.33(1)(d) 11.33(1)€",
            "guidanceUrl": null,
            "action": "Verify that the building is compliant",
            "records": "A record of the separation distances Where there is an intervening wall, a record of the FRR elements of the wall",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 24,
        "number": "Indoor storage or use of LPG, propane, butane, or isobutane",
        "title": "Indoor storage or use of LPG, propane, butane, or isobutane",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "11.42(1)"
            ],
            "regulationRaw": "11.42(1)",
            "guidanceUrl": null,
            "action": "Verify that the quantities of LPG, propane, butane, or isobutane are not more than the maximum",
            "records": "A record of the quantities",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 25,
        "number": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard HSW (HS) Regulations of 2017",
        "title": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard HSW (HS) Regulations of 2017",
        "items": []
      }
    ]
  },
  {
    "code": "wks17-class-6-1a-6-1b-6-1c-8-2a-8",
    "title": "Check sheet Location Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
    "psReference": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard",
    "classScope": [],
    "revision": 1,
    "status": "draft",
    "sections": [
      {
        "ordinal": 1,
        "number": "Requirements specific to class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "title": "Requirements specific to class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.9(1)(a)",
              "13.9(2)",
              "14.3",
              "14.4"
            ],
            "regulationRaw": "13.9(1)(a) 13.9(2) 14.3 14.4",
            "guidanceUrl": null,
            "action": "If there is a class 6.1A or 6.1B substance or any class 6.1 substance that requires a controlled substance licence, verify that— (a) the substance is under the personal control of a certified handler; or (b) if being applied by aerial application, a pilot with a chemical rating is present; or (c) if the substance is handled by another person who is not a certified handler, the certified handler— (i) is present at the place where the substance is being handled; and (ii) has provided guidance to the person in respect of the handling; and (iii) is available at all times to provide assistance to the person while the substance is being handled by the person; or (d) is secure",
            "records": "A record of the following: (a) confirmation of the need for a controlled substance licence: (b) the names of the certified handlers and their certificate numbers: (c) the certificate expiry dates: (d) the procedure(s) and the guidance that have been provided: (e) details of the secure containment",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 2,
        "number": "2 Separation of class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "title": "Separation of class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "items": [
          {
            "ordinal": 1,
            "number": "2",
            "regulationRefs": [
              "13.4"
            ],
            "regulationRaw": "13.4",
            "guidanceUrl": null,
            "action": "For class 6.1A, 6.1B, or 6.1C substances, verify that if an intervening wall is utilised, the requirements prescribed in regulation 13.40 are complied with",
            "records": "A record of— (a) the height of the wall in relation to the place being protected and the containers in the store; and (b) the marking indicating the maximum storage height; and (c) the wall FRR",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "3",
            "regulationRefs": [
              "13.41"
            ],
            "regulationRaw": "13.41",
            "guidanceUrl": null,
            "action": "For class 6.1A, 6.1B, or 6.1C substances, verify that the substances and stores meet the prescribed separation distances from protected places",
            "records": "A record of the following: (a) the actual and prescribed separation distances: (b) in a retail store, that the containers are closed and do not include class 6.1A substances",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "4",
            "regulationRefs": [
              "13.42"
            ],
            "regulationRaw": "13.42",
            "guidanceUrl": null,
            "action": "Minimum separation between public places and hazardous substance locations containing packaged class 6.1 substance. For class 6.1A, 6.1B, or 6.1C substances, verify that— (a) the substances and stores meet the prescribed separation distances from public places; and (b) in a retail store that holds class 6.1B or 6.1C substances for retail sale and the packages remain closed, the minimum separation distance from and within the building is zero",
            "records": "",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "5",
            "regulationRefs": [
              "13.43"
            ],
            "regulationRaw": "13.43",
            "guidanceUrl": null,
            "action": "Minimum separation between protected places and hazardous substance locations containing packaged class 8.2A or 8.2B substances. For class 8.2A or 8.2B substances, verify that: (a) the substances and stores meet the minimum prescribed separation distances for— (i) stores where containers are opened; and (ii) stores where the containers remain closed; and (b) in any retail store to which the public has access to class 8.2A or 8.2B substances for retail sale, the packages remain closed",
            "records": "A record of the following: (a) the actual and prescribed separation distances: (b) in a retail store, that the containers are closed: (c) whether the protected place is on-site and integral: (d) the measures taken to control hazards and minimise risk",
            "evidenceRequired": false
          },
          {
            "ordinal": 5,
            "number": "6",
            "regulationRefs": [
              "17.28"
            ],
            "regulationRaw": "17.28",
            "guidanceUrl": null,
            "action": "Verify that a tank containing a class 6.1A, 6.2B, or 6.1C substance (but not a 6.1D substance for the purposes of this performance standard) that does not have a 2.1.1, 2.1.2, or 3.1 classification meets the minimum prescribed separation distances from a protected place and a public place",
            "records": "A record of— (a) the capacity of the tank; and (b) actual and prescribed separation distances",
            "evidenceRequired": false
          },
          {
            "ordinal": 6,
            "number": "7",
            "regulationRefs": [
              "17.29"
            ],
            "regulationRaw": "17.29",
            "guidanceUrl": null,
            "action": "Verify that a tank containing a class 8.2A or 8.2B substance that does not have a 2.1.1, 2.1.2, 3.1, 6.1A, 6.2B, or 6.1C classification meets the prescribed separation distances from a protected place or public place",
            "records": "A record of— (a) the capacity of the tank; and (b) actual and prescribed separation distances",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 3,
        "number": "3 Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances to be segregated from incompatible substances or material",
        "title": "Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances to be segregated from incompatible substances or material",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.29(2)"
            ],
            "regulationRaw": "13.29(2)",
            "guidanceUrl": null,
            "action": "Verify whether any substances or materials specified in Schedule 15 of the Regulations which are incompatible with class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances are present",
            "records": "A record of the substances",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "13.29(1)",
              "13.29(3)"
            ],
            "regulationRaw": "13.29(1) 13.29(3)",
            "guidanceUrl": null,
            "action": "Verify that— (a) the hazardous substances are not in contact with incompatible substances; and (b) containers of incompatible substances are stored separately",
            "records": "A record of the means of compliance",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 4,
        "number": "4 Stores for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "title": "Stores for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.35(1)"
            ],
            "regulationRaw": "13.35(1) https://www.worksafe.govt.nz/laws-and-regulations/operational-policy-framework/operational-policies/policy-clarification-class-6-and-8/",
            "guidanceUrl": "https://www.worksafe.govt.nz/laws-and-regulations/operational-policy-framework/operational-policies/policy-clarification-class-6-and-8/",
            "action": "Verify that a store containing a class 6 or 8",
            "records": "A record of— (a) the floor area of the store; and (b) the access for emergency services; and (c) the details of the store; and (d) the number of exits; and (e) any authorisation from WorkSafe; and (f) secondary containment details; and (g) ventilation details; and (h) procedures to minimise stack collapse or damage; and (i) the security; and (j) segregation details; and (k) any sources of heat",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "13.35(1)"
            ],
            "regulationRaw": "13.35(1)",
            "guidanceUrl": null,
            "action": "Verify that a store containing a class 6 or 8 substance (or both) and which is opened is also compliant with the additional prescribed requirements",
            "records": "A record of— (a) shower and eyewash facilities, including the name plate; and (b) shower and eyewash facilities having been tested; and (c) hand-washing facilities",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 5,
        "number": "5 Indoor storage cabinets for class 6.1A, 6.1B, and 6.1C substances",
        "title": "Indoor storage cabinets for class 6.1A, 6.1B, and 6.1C substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.36(1)"
            ],
            "regulationRaw": "13.36(1)",
            "guidanceUrl": null,
            "action": "For each hazardous substance location that is an indoor storage cabinet for class 6.1A, 6.1B, or 6.1C substances referred to in regulation 13.34(1), verify that the cabinet is— (a) compliant; and (b) located in accordance with the prescribed requirements; and (c) marked as prescribed",
            "records": "A record of— (a) the location of the cabinet; and (b) the plate of the cabinet; and (c) the markings of the cabinet; and (d) the quantities in the cabinet",
            "evidenceRequired": true
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "13.36(1)"
            ],
            "regulationRaw": "13.36(1)",
            "guidanceUrl": null,
            "action": "Verify that— (a) there are no incompatibles inside the cabinet; and (b) there is a nearby source of water for hand-washing",
            "records": "A confirmatory record",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 6,
        "number": "6 Indoor storage cabinets for class 8.2A and 8.2B substances",
        "title": "Indoor storage cabinets for class 8.2A and 8.2B substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.37(1)"
            ],
            "regulationRaw": "13.37(1)",
            "guidanceUrl": null,
            "action": "For each hazardous substance location that is an indoor storage cabinet for a class 8.2A or 8.2B substance (or both) referred to in regulation 13.34(1), verify that the maximum quantity of hazardous substance is not exceeded, and the cabinet is— (a) compliant; and (b) located in accordance with the prescribed requirements; and (c) marked as prescribed",
            "records": "A record of— (a) the location of the cabinet; and (b) the plate of the cabinet; and (c) the markings of the cabinet; and (d) the quantities in the cabinet",
            "evidenceRequired": true
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "13.37(1)"
            ],
            "regulationRaw": "13.37(1)",
            "guidanceUrl": null,
            "action": "Verify that— (a) there are no incompatibles inside the cabinet; and (b) there is a nearby source of water for hand-washing",
            "records": "A confirmatory record",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 7,
        "number": "7 Fixed structures to be compatible",
        "title": "Fixed structures to be compatible",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.39(g)"
            ],
            "regulationRaw": "13.39(g)",
            "guidanceUrl": null,
            "action": "Verify that any fixed structure or installed equipment is constructed of compatible material and is not an ignition source",
            "records": "A record of the general nature of the structures or installed equipment",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 8,
        "number": "8 Equipment and PPE for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "title": "Equipment and PPE for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.7"
            ],
            "regulationRaw": "13.7",
            "guidanceUrl": null,
            "action": "Verify that when a class 6 or 8 substance is being used at a hazardous substance location— (a) the equipment used to handle the substance is compliant; and (b) the equipment is accompanied by documentation covering the use and maintenance of the equipment; and (c) the documentation is readily available and understandable; and (d) the workplace has the facilities that are specified in a safe work instrument (if applicable)",
            "records": "A record of— (a) the equipment and the state of it; and (b) either the documentation or a note referencing the documentation; and (c) the use and maintenance of the equipment; and (d) the facilities",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 9,
        "number": "9 Clean-up materials and equipment for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "title": "Clean-up materials and equipment for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.45"
            ],
            "regulationRaw": "13.45",
            "guidanceUrl": null,
            "action": "Verify that equipment, materials, and chemicals are available",
            "records": "Records of— (a) the nature of the equipment, materials, and chemicals; and (b) where they are located",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 10,
        "number": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard HSW (HS) Regulations of 2017",
        "title": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard HSW (HS) Regulations of 2017",
        "items": []
      }
    ]
  },
  {
    "code": "wks17-general",
    "title": "General location requirements",
    "psReference": "Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard",
    "classScope": [],
    "revision": 1,
    "status": "draft",
    "sections": [
      {
        "ordinal": 1,
        "number": "1",
        "title": "Determining which regulations apply",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "10.34"
            ],
            "regulationRefsByClass": {
              "class_6_8": [
                "10.34",
                "10.36",
                "12.17",
                "12.42",
                "13.38"
              ],
              "class_2_3": [
                "10.34"
              ]
            },
            "regulationRaw": "10.34 10.36 12.17 12.42 13.38",
            "guidanceUrl": null,
            "action": "Verify that the hazardous substances are present at the site— (a) in quantities exceeding the threshold quantities specified in the Regulations for the hazardous substances; and (b) for periods of time that trigger the relevant requirement to establish a hazardous substance location under the Regulations",
            "records": "A record of— (a) the maximum quantities of the hazardous substances, identified by subclass; and (b) the thresholds that are exceeded",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [],
            "regulationRaw": "All",
            "guidanceUrl": null,
            "action": "Ascertain— (a) whether the PCBU has been granted any exemption or approval that is relevant to the hazardous substance location; and (b) the extent of the exemption or approval including any conditions; and (c) whether any provisions of Schedule 1 (Transitional, Savings, and related provisions) of the Regulations apply",
            "records": "A copy of the exemption or approval A note recording the provisions of Schedule 1 of the Regulations that apply (if any)",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 2,
        "number": "2",
        "title": "Notification requirements",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.34(4)"
            ],
            "regulationRaw": "13.34(4)",
            "guidanceUrl": null,
            "action": "Verify— (a) either— (i) the notification that has been made; or (ii) the most recent location compliance certificate; and (b) the details of the notification or the most recent location compliance certificate including: (i) the name of the company and the PCBU; and (ii) the street address of the workplace; and (c) either— (i) that the maximum quantity and classification of hazardous substances held are consistent with the notification or most recent location compliance certificate; or (ii) if the quantity of hazardous substances held exceeds the quantity notified or set out in the location compliance certificate, that a new notification has been made",
            "records": "A record of— (a) either— (i) the notification; or (ii) the location compliance certificate; or (iii) a unique reference to identify the notification or certificate; and (b) the quantities notified for each relevant class of substance; and (c) the quantities present",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 3,
        "number": "3",
        "title": "Information, instruction, and training",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "4.5"
            ],
            "regulationRaw": "4.5",
            "guidanceUrl": null,
            "action": "Verify that there is a process for each worker to receive relevant information and training",
            "records": "A record of the process",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "4.5(2)"
            ],
            "regulationRaw": "4.5(2)",
            "guidanceUrl": null,
            "action": "Verify that the requirement to provide information to workers is met",
            "records": "A sample record of the worker’s instruction and training or a reference to the worker’s instruction and training",
            "evidenceRequired": true
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "4.5(5)"
            ],
            "regulationRaw": "4.5(5)",
            "guidanceUrl": null,
            "action": "Verify that there is a record of the training and instruction referred to in regulation 4.5(3) for each worker and that this record is available for inspection",
            "records": "A sample record of the worker’s instruction and training or a reference to the worker’s instruction and training",
            "evidenceRequired": true
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "4.5(6)"
            ],
            "regulationRaw": "4.5(6)",
            "guidanceUrl": null,
            "action": "Verify that where information, instruction, and training were not required for a worker, the PCBU can demonstrate that the worker’s previous experience is equivalent",
            "records": "A record of the process the PCBU followed, a sample of one of the records obtained from the PCBU, or a reference to the process or record",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 4,
        "number": "4",
        "title": "Signage",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "2.5(1)"
            ],
            "regulationRaw": "2.5(1)",
            "guidanceUrl": null,
            "action": "Determine whether signs are required",
            "records": "A record of the quantities present, as compared to the threshold quantities",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "2.5(2)"
            ],
            "regulationRaw": "2.5(2)",
            "guidanceUrl": null,
            "action": "Verify that the signs are compliant",
            "records": "Photographs of the signs",
            "evidenceRequired": true
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "2.6(1)"
            ],
            "regulationRaw": "2.6(1)",
            "guidanceUrl": null,
            "action": "Verify that compliant signage is positioned at all required entrances to the building and land",
            "records": "A record of required entrances to the building and land or marked up plan Photographs of the signs if practical. The photographs must include sufficient landscape details to confirm the location. If photographs are not practical, a note confirming compliance",
            "evidenceRequired": true
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "2.6(3)"
            ],
            "regulationRaw": "2.6(3)",
            "guidanceUrl": null,
            "action": "Verify that compliant signage is displayed at each required room or compartment entrance",
            "records": "A list of all rooms or a marked-up plan Photographs of the signs if practical If photographs are not practical, a note confirming compliance",
            "evidenceRequired": true
          },
          {
            "ordinal": 5,
            "number": "5",
            "regulationRefs": [
              "2.6(4)"
            ],
            "regulationRaw": "2.6(4)",
            "guidanceUrl": null,
            "action": "Verify that compliant signage is displayed immediately next to each outdoor area",
            "records": "A list of all outdoor areas or a marked-up plan Photographs of the signs if practical If photographs are not practical, a note confirming compliance",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 5,
        "number": "5",
        "title": "Fire extinguishers",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "5.3(1)"
            ],
            "regulationRaw": "5.3(1)",
            "guidanceUrl": null,
            "action": "Determine whether fire extinguishers are required",
            "records": "A record of the quantities present, as compared to the threshold quantities",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "5.3(1)"
            ],
            "regulationRaw": "5.3(1)",
            "guidanceUrl": null,
            "action": "Verify that the correct numbers of fire extinguishers are present",
            "records": "A record of the following: (a) the required extinguishers: (b) confirmation that the extinguishers are in place by marking up the plan, making a note, or similar: (c) the test dates of all required extinguishers",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "5.4(1)"
            ],
            "regulationRaw": "5.4(1)",
            "guidanceUrl": null,
            "action": "Verify that the fire extinguishers are clearly visible and readily accessible in an emergency",
            "records": "A record of proximity, visibility, and accessibility of fire extinguishers to the hazardous substance location",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "5.5"
            ],
            "regulationRaw": "5.5",
            "guidanceUrl": null,
            "action": "Verify the capability of the fire extinguishers",
            "records": "A record of the ratings of sample extinguishers or hose diameter of a hydrant system",
            "evidenceRequired": true
          }
        ]
      },
      {
        "ordinal": 6,
        "number": "6",
        "title": "Emergency response plans (ERP)",
        "items": [
          {
            "ordinal": 1,
            "number": null,
            "regulationRefs": [
              "5.6(1)"
            ],
            "regulationRaw": "5.6(1)",
            "guidanceUrl": null,
            "action": "Determine whether an ERP is required",
            "records": "A record of the quantities present, as compared to the threshold quantities",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": null,
            "regulationRefs": [
              "5.7(2)"
            ],
            "regulationRaw": "5.7(2)",
            "guidanceUrl": null,
            "action": "Verify that the ERP describes all emergencies that are reasonably foreseeable",
            "records": "A copy of the ERP or sections of it",
            "evidenceRequired": true
          },
          {
            "ordinal": 3,
            "number": null,
            "regulationRefs": [
              "5.7(3)(a)"
            ],
            "regulationRaw": "5.7(3)(a)",
            "guidanceUrl": null,
            "action": "Verify that the ERP describes the actions to be taken",
            "records": "A copy of the ERP, sections of it, or a reference to it",
            "evidenceRequired": true
          },
          {
            "ordinal": 4,
            "number": null,
            "regulationRefs": [
              "5.7(3)(b)"
            ],
            "regulationRaw": "5.7(3)(b)",
            "guidanceUrl": null,
            "action": "Verify that the ERP identifies each person with responsibility and gives the required information",
            "records": "A copy of the ERP, sections of it, or a reference to it",
            "evidenceRequired": true
          },
          {
            "ordinal": 5,
            "number": null,
            "regulationRefs": [
              "5.7(3)"
            ],
            "regulationRaw": "5.7(3)©",
            "guidanceUrl": null,
            "action": "Verify that the ERP specifies the prescribed actions",
            "records": "A copy of the ERP, sections of it, or a reference to it",
            "evidenceRequired": true
          },
          {
            "ordinal": 6,
            "number": null,
            "regulationRefs": [
              "5.7(3)(d)"
            ],
            "regulationRaw": "5.7(3)(d)",
            "guidanceUrl": null,
            "action": "Verify that the ERP provides an inventory and compliant site plan",
            "records": "A copy of the ERP, sections of it, or a reference to it",
            "evidenceRequired": true
          },
          {
            "ordinal": 7,
            "number": null,
            "regulationRefs": [
              "5.7(4)"
            ],
            "regulationRaw": "5.7(4)",
            "guidanceUrl": null,
            "action": "Verify that the ERP— (a) specifies the required extra information for emergencies involving a fire; and (b) provides for retention of liquid or liquid oxidising substance or organic peroxide present",
            "records": "A copy of the ERP, sections of it, or a reference to it",
            "evidenceRequired": true
          },
          {
            "ordinal": 8,
            "number": null,
            "regulationRefs": [
              "5.8"
            ],
            "regulationRaw": "5.8",
            "guidanceUrl": null,
            "action": "The ERP is implemented in the event of an emergency",
            "records": "A record of the implementation of it for events during the previous 12 months (if applicable)",
            "evidenceRequired": false
          },
          {
            "ordinal": 9,
            "number": null,
            "regulationRefs": [
              "5.9"
            ],
            "regulationRaw": "5.9",
            "guidanceUrl": null,
            "action": "Verify that all equipment, materials, and responsible people are available within the times specified in the ERP",
            "records": "A note of the sampling or a record of the tests carried out",
            "evidenceRequired": false
          },
          {
            "ordinal": 10,
            "number": null,
            "regulationRefs": [
              "5.1"
            ],
            "regulationRaw": "5.1",
            "guidanceUrl": null,
            "action": "Verify that the PCBU is able to confirm the plan is available to every person responsible for executing any part of the plan and emergency service providers identified in the plan",
            "records": "A note recording how the plan has been made available A reference to its location",
            "evidenceRequired": false
          },
          {
            "ordinal": 11,
            "number": null,
            "regulationRefs": [
              "5.11"
            ],
            "regulationRaw": "5.11",
            "guidanceUrl": null,
            "action": "Verify that if Fire and Emergency New Zealand (FENZ) has been given the opportunity to review the ERP, any recommendations have been given consideration by the PCBU",
            "records": "A record of advice to FENZ and a note of any recommendations from FENZ",
            "evidenceRequired": false
          },
          {
            "ordinal": 12,
            "number": null,
            "regulationRefs": [
              "5.12"
            ],
            "regulationRaw": "5.12",
            "guidanceUrl": null,
            "action": "Verify the ERP has been tested, that new persons are competent, that new procedures are workable, and that records of the tests are held",
            "records": "A reference to the tests and actions taken A record of the PCBU records",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 7,
        "number": "7",
        "title": "Secondary containment",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.3"
            ],
            "regulationRaw": "13.3",
            "guidanceUrl": null,
            "action": "Determine whether secondary containment is required",
            "records": "A record of— (a) the quantities present as compared to the threshold quantities; and (b) the minimum time periods the substances are present",
            "evidenceRequired": false
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "10.31",
              "10.32",
              "10.33"
            ],
            "regulationRefsByClass": {
              "class_6_8": [
                "10.31",
                "10.32",
                "10.33",
                "12.14",
                "12.15",
                "12.16",
                "12.39",
                "12.40",
                "12.41",
                "13.31",
                "13.32",
                "13.33",
                "17.100",
                "17.101"
              ],
              "class_2_3": [
                "10.31",
                "10.32",
                "10.33"
              ]
            },
            "regulationRaw": "10.31 10.32 10.33 12.14 12.15 12.16 12.39 12.40 12.41 13.31 13.32 13.33 17.100 17.101",
            "guidanceUrl": null,
            "action": "Verify that— (a) the capacity of the secondary containment system is at least as great as the prescribed minimum; and (b) the capacity of the secondary containment system for stationary tanks and process containers is based on the water capacity of the tank or process container; and (c) the secondary containment will contain the substance without leakage and will enable recovery of the substance; and (d) there are controls to prevent contamination by incompatible substances or material For class 6 and 8 substances, verify that there are controls to prevent people from being directly exposed to any toxic or biological corrosive substances contained in the secondary containment system",
            "records": "A record of— (a) the maximum pooling capacity; and (b) the prescribed capacity of the secondary containment; and (c) the actual capacity of the secondary containment; and (d) the nature of the construction; and (e) the impervious nature of the secondary containment system, including tests and inspections undertaken on it; and (f) the process to recover the substances; and (g) for class 3, 4, or 5 substances, controls that prevent ignition; and (h) for toxic or biological corrosive substances, controls that prevent people from being directly exposed e.g. signage, site induction instructions; and (i) controls that prevent the substance from being contaminated with incompatible substances",
            "evidenceRequired": false
          },
          {
            "ordinal": 3,
            "number": "3",
            "regulationRefs": [
              "10.30",
              "12.13",
              "12.38",
              "13.30"
            ],
            "regulationRaw": "10.30 12.13 12.38 13.30",
            "guidanceUrl": null,
            "action": "If containers of different capacities are held at the place, verify that the secondary containment system has a capacity of at least the sum of each individual container category",
            "records": "A record to confirm that either— (a) containers of different sizes are not held at one place; or (b) if they are held, the secondary containment capacity is at least the sum of each individual container capacity",
            "evidenceRequired": false
          },
          {
            "ordinal": 4,
            "number": "4",
            "regulationRefs": [
              "10.30",
              "12.13",
              "12.38",
              "13.30"
            ],
            "regulationRaw": "10.30 12.13 12.38 13.30",
            "guidanceUrl": null,
            "action": "Verify that the secondary containment is able to contain the leaked hazardous substance",
            "records": "A record of one of the results of the verification. This can include: (a) for an above ground tank with integral secondary containment, no evidence of leakage into or from the interstitial space: (b) for a below ground tank with secondary containment, no evidence of leakage into or from the interstitial space: (c) for a below ground tank, no evidence of losses from the stock reconciliation records: (d) for a single skin above ground tank with a capacity of 250,000 L or greater, evidence of flood test: (e) for a single skin above ground tank with a capacity of up to 250,000 L, either the results of a technical inspection or a flood test: (f) the distance between the tank and the inside of the bund wall, including whether the distance is sufficient to enable leaks to fall inside the bund",
            "evidenceRequired": false
          },
          {
            "ordinal": 5,
            "number": "6",
            "regulationRefs": [
              "17.102(4)",
              "17.102(5)"
            ],
            "regulationRaw": "17.102(4) 17.102(5)",
            "guidanceUrl": null,
            "action": "Verify that the aggregate capacity of any group of stationary tanks does not exceed 25,000,000 L unless a greater amount is approved by WorkSafe",
            "records": "A record of the quantity in each group of tanks and a reference to any approval by WorkSafe",
            "evidenceRequired": false
          },
          {
            "ordinal": 6,
            "number": "7",
            "regulationRefs": [
              "17.102(6)",
              "17.102(7)"
            ],
            "regulationRaw": "17.102(6)) 17.102(7)",
            "guidanceUrl": null,
            "action": "Verify that any intermediate secondary containment system is compliant",
            "records": "A record of the details of the secondary containment system",
            "evidenceRequired": false
          }
        ]
      },
      {
        "ordinal": 8,
        "number": "8",
        "title": "Site Plan",
        "items": [
          {
            "ordinal": 1,
            "number": "1",
            "regulationRefs": [
              "13.34(5)(b)"
            ],
            "regulationRaw": "13.34(5)(b)",
            "guidanceUrl": null,
            "action": "Verify that the site plan— (a) is of the relevant place and is specific to that place; and (b) is accurate and includes all prescribed information",
            "records": "A copy of the site plan, including: (a) the dimensions in relation to the site boundary: (b) a north point accurately orientated: (c) hazardous substance locations: (d) hazardous areas: (e) separation distances from protected places and public places, if prescribed: (f) relevant controlled zone distances",
            "evidenceRequired": true
          },
          {
            "ordinal": 2,
            "number": "2",
            "regulationRefs": [
              "13.34(5)(b)"
            ],
            "regulationRaw": "13.34(5)(b)",
            "guidanceUrl": null,
            "action": "Verify that the site plan has sufficient detail to determine its purpose",
            "records": "A copy of the site plan, including: (a) the scale that enables the plan to meet its purpose: (b) where relevant, elevation drawings: (c) where relevant, a legend or key that defines colours, shaded areas, symbols, abbreviations, etc.: (d) if relevant, and the scale and complexity of the workplace so demand, separate drawings provided to meet the purpose",
            "evidenceRequired": true
          }
        ]
      }
    ]
  }
] as const;

export const TEMPLATES_BY_CODE: Readonly<Record<string, ChecksheetTemplate>> =
  Object.fromEntries(CHECKSHEET_TEMPLATES.map((t) => [t.code, t]));

/**
 * Regulation references for an item, applying the class overlay when the
 * applicable regulations are class-scoped.
 */
export function regulationRefsFor(item: ChecksheetItem, classKey?: string): readonly string[] {
  if (classKey && item.regulationRefsByClass?.[classKey]) return item.regulationRefsByClass[classKey];
  return item.regulationRefs;
}
